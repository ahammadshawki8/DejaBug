import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { TimeoutError, ToolMissingError } from "./errors.js";
import { commandVersion } from "./tool.js";
import type { LanguageAdapter, RunOptions, RunResult } from "./types.js";

const execFileAsync = promisify(execFile);

const DEFAULT_TEST_TIMEOUT_SEC = 45;

export function isGoTestFile(file: string): boolean {
  return file.endsWith("_test.go");
}

export function isGoSourceFile(file: string): boolean {
  return file.endsWith(".go") && !isGoTestFile(file) && !file.startsWith("vendor/");
}

/** True when a Go file needs build tags to compile (for example sarama's functional tests). */
export function hasBuildConstraint(content: string): boolean {
  return /^\/\/go:build\s/m.test(content) || /^\/\/ \+build\s/m.test(content);
}

/** Go package argument for a file: "." for the repo root, "./dir" otherwise. */
export function packageOf(file: string): string {
  const dir = path.posix.dirname(file);
  return dir === "." ? "." : `./${dir}`;
}

/**
 * Test function names touched by a unified diff (-U0) of Go test files: functions whose
 * `func TestX(` line is added, plus the enclosing function named in a hunk header when
 * the hunk edits inside an existing test. A hunk that adds its own test declaration is
 * an append, so its header (which names the previous function) is ignored.
 */
export function goTestsTouched(diff: string): string[] {
  const names = new Set<string>();
  let headerTest: string | undefined;
  let hunkAddsTest = false;

  const closeHunk = () => {
    if (headerTest && !hunkAddsTest) names.add(headerTest);
    headerTest = undefined;
    hunkAddsTest = false;
  };

  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      closeHunk();
      headerTest = /^@@ [^@]* @@ func (Test\w+)\s*\(/.exec(line)?.[1];
      continue;
    }
    if (line.startsWith("diff --git")) {
      closeHunk();
      continue;
    }
    const added = /^\+func (Test\w+)\s*\(/.exec(line);
    if (added?.[1]) {
      names.add(added[1]);
      hunkAddsTest = true;
    }
  }
  closeHunk();
  return [...names].sort();
}

/** Classifies `go test` output. `exitOk` is true when go exited with status 0. */
export function classifyGoOutput(exitOk: boolean, output: string): RunResult {
  const failingTests = [...new Set([...output.matchAll(/^--- FAIL: (\S+)/gm)].map((m) => m[1] as string))];
  if (/panic: test timed out after/.test(output)) {
    return { outcome: "hang", output, failingTests };
  }
  if (exitOk) {
    const noTests =
      output.includes("[no tests to run]") || output.includes("testing: warning: no tests to run");
    return { outcome: noTests ? "notest" : "pass", output, failingTests: [] };
  }
  if (failingTests.length > 0) return { outcome: "fail", output, failingTests };
  return { outcome: "build", output, failingTests: [] };
}

/**
 * Groups package targets ("./a/b", relative to `dir`) by their nearest enclosing go.mod,
 * because a repository can contain several Go modules (for example `v2/go.mod`).
 * Returns module dir (relative, "." for root) -> package args relative to that module.
 */
export function groupByModule(
  targets: string[],
  hasGoMod: (relDir: string) => boolean,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const target of targets) {
    const rel = target === "." ? "." : target.replace(/^\.\//, "");
    let moduleDir = rel;
    while (moduleDir !== "." && !hasGoMod(moduleDir)) moduleDir = path.posix.dirname(moduleDir);
    const inner = moduleDir === "." ? rel : path.posix.relative(moduleDir, rel) || ".";
    const arg = inner === "." ? "." : `./${inner}`;
    groups.set(moduleDir, [...(groups.get(moduleDir) ?? []), arg]);
  }
  return groups;
}

const OUTCOME_PRIORITY: RunResult["outcome"][] = ["build", "hang", "fail", "pass", "notest"];

/** Combines per-module results: any build/hang/fail dominates, "notest" only if nothing ran anywhere. */
export function combineResults(results: RunResult[]): RunResult {
  const outcome = OUTCOME_PRIORITY.find((o) => results.some((r) => r.outcome === o)) ?? "notest";
  return {
    outcome,
    output: results.map((r) => r.output).join("\n"),
    failingTests: [...new Set(results.flatMap((r) => r.failingTests))],
  };
}

async function runGoTestsInModule(
  cwd: string,
  targets: string[],
  tests: string[],
  testTimeoutSec: number,
  processTimeoutMs: number,
): Promise<RunResult> {
  const args = [
    "test",
    "-run",
    `^(${tests.join("|")})$`,
    "-count=1",
    "-timeout",
    `${testTimeoutSec}s`,
    ...targets,
  ];
  try {
    const { stdout, stderr } = await execFileAsync("go", args, {
      cwd,
      timeout: processTimeoutMs,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return classifyGoOutput(true, stdout + stderr);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean };
    if (e.code === "ENOENT") throw new ToolMissingError("go");
    if (e.killed) throw new TimeoutError();
    return classifyGoOutput(false, (e.stdout ?? "") + (e.stderr ?? ""));
  }
}

async function runGoTests(
  dir: string,
  targets: string[],
  tests: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const testTimeoutSec = options.testTimeoutSec ?? DEFAULT_TEST_TIMEOUT_SEC;
  const processTimeoutMs = options.processTimeoutMs ?? (testTimeoutSec + 30) * 1000;
  const groups = groupByModule(targets, (rel) => existsSync(path.join(dir, rel, "go.mod")));

  const results: RunResult[] = [];
  for (const [moduleDir, moduleTargets] of groups) {
    results.push(
      await runGoTestsInModule(
        path.join(dir, moduleDir),
        moduleTargets,
        tests,
        testTimeoutSec,
        processTimeoutMs,
      ),
    );
  }
  return combineResults(results);
}

export const goAdapter: LanguageAdapter = {
  id: "go",
  name: "Go",
  detect: (repoDir) => existsSync(path.join(repoDir, "go.mod")),
  isTestFile: isGoTestFile,
  isSourceFile: isGoSourceFile,
  isRunnableTestFile: (content) => !hasBuildConstraint(content),
  testsTouched: goTestsTouched,
  testTargets: (testFiles) => [...new Set(testFiles.map(packageOf))].sort(),
  runTests: runGoTests,
  toolCheck: () => {
    const v = commandVersion("go", ["version"]);
    return v ? { ok: true, detail: v } : { ok: false, detail: "go not found on PATH (install Go 1.22+)" };
  },
};
