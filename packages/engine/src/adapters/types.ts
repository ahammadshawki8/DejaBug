/**
 * How a test run ended, independent of language:
 * - pass: the selected tests ran and passed
 * - fail: at least one selected test failed (the bug reproduced)
 * - hang: a selected test blocked until the per-test timeout (a deadlock or infinite retry reproduced)
 * - build: the tests could not be built or collected (compile/import error)
 * - notest: nothing matched the selected test names
 */
export type RunOutcome = "pass" | "fail" | "hang" | "build" | "notest";

export interface RunResult {
  outcome: RunOutcome;
  output: string;
  failingTests: string[];
}

export interface RunOptions {
  /** Per-test timeout inside the test runner. A breach is reported as a "hang". */
  testTimeoutSec?: number;
  /** Hard kill for the whole process. A breach throws TimeoutError. */
  processTimeoutMs?: number;
}

export interface ToolCheck {
  ok: boolean;
  detail: string;
}

/** Everything the engine needs to know about one language. Nothing outside adapters/ may be language-specific. */
export interface LanguageAdapter {
  id: string;
  name: string;
  /** True when the repository at `repoDir` uses this language. */
  detect(repoDir: string): boolean;
  isTestFile(file: string): boolean;
  isSourceFile(file: string): boolean;
  /** False for test files that a plain test run skips (for example Go files behind build tags). */
  isRunnableTestFile(content: string): boolean;
  /** Test names added or changed by a zero-context diff of test files. */
  testsTouched(diff: string): string[];
  /** Runner targets (packages, files) that contain the given test files. */
  testTargets(testFiles: string[]): string[];
  /** Runs `tests` in `targets` inside `dir`. Throws ToolMissingError or TimeoutError. */
  runTests(dir: string, targets: string[], tests: string[], options?: RunOptions): Promise<RunResult>;
  toolCheck(): ToolCheck;
}
