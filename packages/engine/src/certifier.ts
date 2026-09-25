// T2.1: certifier core -- worktree lifecycle, test overlay, adapter-based test runner,
// output parsing, 3-run fail rule, 1-run pass rule, all rejection statuses.
// T2.2: parallel pool (default concurrency 4); each worker slot carries its index.
// T2.6: uses adapter.runTests() (REVIEW-01 items 0-5, 10); no Go literals.

import type { EventEmitter } from "node:events";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getAdapter, TimeoutError, ToolMissingError } from "./adapters/index.js";
import type { RunOutcome } from "./adapters/index.js";
import { git } from "./git.js";
import type { Candidate, Certification, CertificationStatus, ForgeEvent } from "./types.js";

const FAIL_RUNS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Keep only the last `n` characters of a string (tail is where failures live). */
function tail(s: string, n = 4000): string {
  return s.length <= n ? s : s.slice(-n);
}

/**
 * Strip the worktree path from recorded output so no local temp dir or username
 * leaks into stored data (REVIEW-01 item 2).
 * Handles both backslash (Windows native) and forward-slash (go output on Windows).
 */
function sanitize(output: string, wtDir: string): string {
  const fwd = wtDir.replace(/\\/g, "/");
  // Escape both forms for use in a regex, then strip them globally.
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return output.replace(new RegExp(escape(wtDir), "g"), "").replace(new RegExp(escape(fwd), "g"), "");
}

// ---------------------------------------------------------------------------
// Worktree lifecycle
// ---------------------------------------------------------------------------

async function addWorktree(repoDir: string, sha: string, wtDir: string): Promise<void> {
  // Prune stale worktree metadata, then force-remove any leftover directory so
  // a previous crashed run never blocks a fresh one (REVIEW-T2.1 item 4).
  await git(repoDir, ["worktree", "prune"]).catch(() => undefined);
  await rm(wtDir, { recursive: true, force: true });
  await git(repoDir, ["worktree", "add", "--detach", wtDir, sha]);
}

async function removeWorktree(repoDir: string, wtDir: string): Promise<void> {
  await git(repoDir, ["worktree", "remove", "--force", wtDir]).catch(() => {
    // best-effort: ignore errors (directory may already be gone)
  });
}

// ---------------------------------------------------------------------------
// File overlay (fail phase only)
// ---------------------------------------------------------------------------

async function overlayFiles(wtDir: string, fixSha: string, files: string[]): Promise<void> {
  if (files.length === 0) return;
  await git(wtDir, ["checkout", fixSha, "--", ...files]);
}

// ---------------------------------------------------------------------------
// Per-candidate certification
// ---------------------------------------------------------------------------

function emit(emitter: EventEmitter, event: ForgeEvent): void {
  emitter.emit("forge", event);
}

async function certifyOne(
  candidate: Candidate,
  repoDir: string,
  emitter: EventEmitter,
  workerIndex: number,
): Promise<Certification> {
  const { fixSha, parentSha, testFiles, packages, tests } = candidate;
  const wtDir = path.join(os.tmpdir(), `dejabug-wt-${fixSha}`);
  const start = Date.now();

  // Resolve the language adapter for this candidate (REVIEW-01 item 0).
  const adapter = getAdapter(candidate.language);

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
    const failOutcomes: RunOutcome[] = [];
    for (let attempt = 1; attempt <= FAIL_RUNS; attempt++) {
      let result: Awaited<ReturnType<typeof adapter.runTests>>;
      try {
        result = await adapter.runTests(wtDir, packages, tests);
      } catch (err) {
        if (err instanceof TimeoutError) {
          status = "rejected:timeout";
          emit(emitter, {
            type: "run",
            worker: workerIndex,
            fixSha,
            phase: "fail",
            attempt,
            ok: false,
          });
          emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
          return {
            fixSha,
            status,
            failRuns,
            passRuns,
            failOutput,
            passOutput,
            durationMs: Date.now() - start,
          };
        }
        throw err;
      }

      // build failure in the fail phase (REVIEW-01 item 3: record output).
      if (result.outcome === "build") {
        failOutput = tail(sanitize(result.output, wtDir));
        status = "rejected:build";
        emit(emitter, {
          type: "run",
          worker: workerIndex,
          fixSha,
          phase: "fail",
          attempt,
          ok: false,
        });
        emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
        return {
          fixSha,
          status,
          failRuns,
          passRuns,
          failOutput,
          passOutput,
          durationMs: Date.now() - start,
        };
      }

      // "notest" in the fail phase: the test names do not exist (REVIEW-01 item 3: record output).
      if (result.outcome === "notest") {
        passOutput = tail(sanitize(result.output, wtDir));
        status = "rejected:no-fail";
        emit(emitter, {
          type: "run",
          worker: workerIndex,
          fixSha,
          phase: "fail",
          attempt,
          ok: false,
        });
        emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
        return {
          fixSha,
          status,
          failRuns,
          passRuns,
          failOutput,
          passOutput,
          durationMs: Date.now() - start,
        };
      }

      // "hang" in the fail phase = the bug reproduced as a deadlock (REVIEW-01 item 4).
      // Count it as a "fail" for the 3-run rule.
      if (result.outcome === "hang") {
        const ok = true;
        emit(emitter, { type: "run", worker: workerIndex, fixSha, phase: "fail", attempt, ok });
        failOutcomes.push("fail");
        failRuns++;
        if (failOutput === "") failOutput = tail(sanitize(result.output, wtDir));
        continue;
      }

      const ok = result.outcome === "fail";
      emit(emitter, { type: "run", worker: workerIndex, fixSha, phase: "fail", attempt, ok });

      failOutcomes.push(result.outcome);
      if (result.outcome === "fail") {
        failRuns++;
        if (failOutput === "") failOutput = tail(sanitize(result.output, wtDir));
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
      return {
        fixSha,
        status,
        failRuns,
        passRuns,
        failOutput,
        passOutput,
        durationMs: Date.now() - start,
      };
    }

    // --- pass phase: restore the full fix-commit tree (REVIEW-01 item 10) ---
    // Using `git checkout <fixSha> -- .` ensures generated files, go.mod, go.sum,
    // and any other non-source non-test files changed by the fix are also present.
    await git(wtDir, ["checkout", fixSha, "--", "."]);

    let passResult: Awaited<ReturnType<typeof adapter.runTests>>;
    try {
      passResult = await adapter.runTests(wtDir, packages, tests);
    } catch (err) {
      if (err instanceof TimeoutError) {
        status = "rejected:timeout";
        emit(emitter, {
          type: "run",
          worker: workerIndex,
          fixSha,
          phase: "pass",
          attempt: 1,
          ok: false,
        });
        emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
        return {
          fixSha,
          status,
          failRuns,
          passRuns,
          failOutput,
          passOutput,
          durationMs: Date.now() - start,
        };
      }
      throw err;
    }

    // "hang" in pass phase = test blocks after the fix; the fix did not resolve it (item 4).
    if (passResult.outcome === "hang") {
      passOutput = tail(sanitize(passResult.output, wtDir));
      status = "rejected:no-pass";
      emit(emitter, {
        type: "run",
        worker: workerIndex,
        fixSha,
        phase: "pass",
        attempt: 1,
        ok: false,
      });
      emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
      return {
        fixSha,
        status,
        failRuns,
        passRuns,
        failOutput,
        passOutput,
        durationMs: Date.now() - start,
      };
    }

    // "notest" in the pass phase: test names do not exist after the fix (REVIEW-01 item 3).
    if (passResult.outcome === "notest") {
      passOutput = tail(sanitize(passResult.output, wtDir));
      status = "rejected:no-pass";
      emit(emitter, {
        type: "run",
        worker: workerIndex,
        fixSha,
        phase: "pass",
        attempt: 1,
        ok: false,
      });
      emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
      return {
        fixSha,
        status,
        failRuns,
        passRuns,
        failOutput,
        passOutput,
        durationMs: Date.now() - start,
      };
    }

    const passOk = passResult.outcome === "pass";
    emit(emitter, {
      type: "run",
      worker: workerIndex,
      fixSha,
      phase: "pass",
      attempt: 1,
      ok: passOk,
    });

    if (passOk) {
      passRuns++;
      passOutput = tail(sanitize(passResult.output, wtDir));
      status = "certified";
    } else {
      // "fail" in pass phase: the fix did not make the test pass (REVIEW-01 item 3).
      passOutput = tail(sanitize(passResult.output, wtDir));
      status = "rejected:no-pass";
    }

    emit(emitter, { type: "result", worker: workerIndex, fixSha, status });
    return {
      fixSha,
      status,
      failRuns,
      passRuns,
      failOutput,
      passOutput,
      durationMs: Date.now() - start,
    };
  } finally {
    await removeWorktree(repoDir, wtDir);
  }
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Certify a list of candidates in parallel.
 * Emits ForgeEvents on `emitter` (event name "forge") as work proceeds.
 * Each of the `concurrency` worker slots carries its 0-based index in every event.
 * `ToolMissingError` is rethrown to abort the whole run (REVIEW-01 item 1).
 * Any other unexpected per-candidate error is caught and returned as rejected:build
 * so one bad candidate never aborts the rest (REVIEW-T2.1 item 4).
 * True worker slots: at most one candidate in flight per slot at any moment (REVIEW-01 item 5).
 */
export async function certify(
  candidates: Candidate[],
  repoDir: string,
  emitter: EventEmitter,
  concurrency = 4,
): Promise<Certification[]> {
  const results: Certification[] = new Array(candidates.length);
  let next = 0;

  const worker = async (slot: number): Promise<void> => {
    while (next < candidates.length) {
      const idx = next++;
      const candidate = candidates[idx]!;
      try {
        results[idx] = await certifyOne(candidate, repoDir, emitter, slot);
      } catch (err: unknown) {
        // ToolMissingError is a fatal infrastructure failure -- abort the whole run.
        if (err instanceof ToolMissingError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        results[idx] = {
          fixSha: candidate.fixSha,
          status: "rejected:build",
          failRuns: 0,
          passRuns: 0,
          failOutput: tail(msg),
          passOutput: "",
          durationMs: 0,
        };
        emit(emitter, {
          type: "result",
          worker: slot,
          fixSha: candidate.fixSha,
          status: "rejected:build",
        });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
  return results;
}
