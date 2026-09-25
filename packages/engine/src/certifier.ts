// T2.1: certifier core -- worktree lifecycle, test overlay, go test runner,
// output parsing, 3-run fail rule, 1-run pass rule, all rejection statuses.
// Parallel pool (p-limit) is added in T2.2; this file runs candidates sequentially.

import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { git } from "./git.js";
import type { Candidate, Certification, CertificationStatus, ForgeEvent } from "./types.js";

const execFileAsync = promisify(execFile);

const PHASE_TIMEOUT_MS = 120_000;
const FAIL_RUNS = 3;

// ---------------------------------------------------------------------------
// Worktree lifecycle
// ---------------------------------------------------------------------------

async function addWorktree(repoDir: string, sha: string, wtDir: string): Promise<void> {
  await git(repoDir, ["worktree", "add", "--detach", wtDir, sha]);
}

async function removeWorktree(repoDir: string, wtDir: string): Promise<void> {
  await git(repoDir, ["worktree", "remove", "--force", wtDir]).catch(() => {
    // best-effort: ignore errors (directory may already be gone)
  });
}

// ---------------------------------------------------------------------------
// File overlay
// ---------------------------------------------------------------------------

async function overlayFiles(wtDir: string, fixSha: string, files: string[]): Promise<void> {
  if (files.length === 0) return;
  await git(wtDir, ["checkout", fixSha, "--", ...files]);
}

// ---------------------------------------------------------------------------
// go test runner
// ---------------------------------------------------------------------------

class TimeoutError extends Error {
  constructor() {
    super("go test timed out");
    this.name = "TimeoutError";
  }
}

type GoOutcome = "build" | "fail" | "pass";

interface GoResult {
  outcome: GoOutcome;
  output: string;
}

async function runGoTest(
  wtDir: string,
  packages: string[],
  tests: string[],
): Promise<GoResult> {
  const runArg = tests.join("|");
  const args = [
    "test",
    "-run", runArg,
    "-count=1",
    "-timeout", "120s",
    ...packages,
  ];

  let stdout = "";
  let stderr = "";

  try {
    const result = await execFileAsync("go", args, {
      cwd: wtDir,
      timeout: PHASE_TIMEOUT_MS,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean; signal?: string };
    stdout = e.stdout ?? "";
    stderr = e.stderr ?? "";

    if (e.killed === true || e.code === "ETIMEDOUT" || e.signal === "SIGTERM") {
      throw new TimeoutError();
    }

    const combined = stdout + stderr;
    // Non-zero exit with no FAIL line means the test binary never ran (compile error).
    if (!/^FAIL\b/m.test(combined)) {
      return { outcome: "build", output: combined };
    }
    return { outcome: "fail", output: combined };
  }

  return { outcome: "pass", output: stdout + stderr };
}

// ---------------------------------------------------------------------------
// Per-candidate certification
// ---------------------------------------------------------------------------

function emit(emitter: EventEmitter, event: ForgeEvent): void {
  emitter.emit("forge", event);
}

async function certifyone(
  candidate: Candidate,
  repoDir: string,
  emitter: EventEmitter,
  workerIndex: number,
): Promise<Certification> {
  const { fixSha, parentSha, testFiles, sourceFiles, packages, tests } = candidate;
  const wtDir = path.join(os.tmpdir(), `dejabug-wt-${fixSha}`);
  const start = Date.now();

  emit(emitter, { type: "stage", worker: workerIndex, fixSha, stage: "certify" });

  let status: CertificationStatus = "certified";
  let failOutput = "";
  let passOutput = "";
  let failRuns = 0;
  let passRuns = 0;

  try {
    await addWorktree(repoDir, parentSha, wtDir);
    await overlayFiles(wtDir, fixSha, testFiles);

    // --- fail phase: must fail all FAIL_RUNS times ---
    const failOutcomes: GoOutcome[] = [];
    for (let attempt = 1; attempt <= FAIL_RUNS; attempt++) {
      let result: GoResult;
      try {
        result = await runGoTest(wtDir, packages, tests);
      } catch (err) {
        if (err instanceof TimeoutError) {
          status = "rejected:timeout";
          emit(emitter, { type: "run", worker: workerIndex, fixSha, phase: "fail", attempt, ok: false });
          emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
          return { fixSha, status, failRuns, passRuns, failOutput, passOutput, durationMs: Date.now() - start };
        }
        throw err;
      }

      const ok = result.outcome === "fail";
      emit(emitter, { type: "run", worker: workerIndex, fixSha, phase: "fail", attempt, ok });

      if (result.outcome === "build") {
        status = "rejected:build";
        emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
        return { fixSha, status, failRuns, passRuns, failOutput, passOutput, durationMs: Date.now() - start };
      }

      failOutcomes.push(result.outcome);
      if (result.outcome === "fail") {
        failRuns++;
        if (failOutput === "") failOutput = result.output;
      } else {
        passRuns++;
      }
    }

    // classify fail-phase outcomes
    const allFailed = failOutcomes.every((o) => o === "fail");
    const anyPassed = failOutcomes.some((o) => o === "pass");

    if (allFailed && anyPassed) {
      // impossible branch (sanity), treat as flaky
      status = "rejected:flaky";
    } else if (!allFailed && anyPassed) {
      status = failRuns === 0 ? "rejected:no-fail" : "rejected:flaky";
    }

    if (status !== "certified") {
      emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
      return { fixSha, status, failRuns, passRuns, failOutput, passOutput, durationMs: Date.now() - start };
    }

    // --- pass phase: overlay source files, must pass once ---
    await overlayFiles(wtDir, fixSha, sourceFiles);

    let passResult: GoResult;
    try {
      passResult = await runGoTest(wtDir, packages, tests);
    } catch (err) {
      if (err instanceof TimeoutError) {
        status = "rejected:timeout";
        emit(emitter, { type: "run", worker: workerIndex, fixSha, phase: "pass", attempt: 1, ok: false });
        emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
        return { fixSha, status, failRuns, passRuns, failOutput, passOutput, durationMs: Date.now() - start };
      }
      throw err;
    }

    const passOk = passResult.outcome === "pass";
    emit(emitter, { type: "run", worker: workerIndex, fixSha, phase: "pass", attempt: 1, ok: passOk });

    if (passOk) {
      passRuns++;
      passOutput = passResult.output;
      status = "certified";
    } else {
      status = "rejected:no-pass";
    }

    emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
    return { fixSha, status, failRuns, passRuns, failOutput, passOutput, durationMs: Date.now() - start };
  } finally {
    await removeWorktree(repoDir, wtDir);
  }
}

// ---------------------------------------------------------------------------
// Public surface (T2.2 will replace the for-loop with p-limit)
// ---------------------------------------------------------------------------

/**
 * Certify a list of candidates.
 * Emits ForgeEvents on `emitter` (event name "forge") as work proceeds.
 * concurrency: ignored in T2.1; the parallel pool is added in T2.2.
 */
export async function certify(
  candidates: Candidate[],
  repoDir: string,
  emitter: EventEmitter,
  concurrency = 4,
): Promise<Certification[]> {
  void concurrency; // used in T2.2
  const results: Certification[] = [];
  for (const candidate of candidates) {
    const cert = await certifyone(candidate, repoDir, emitter, 0);
    results.push(cert);
  }
  return results;
}
