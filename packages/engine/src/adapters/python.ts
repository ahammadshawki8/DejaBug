import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { ToolMissingError } from "./errors.js";
import { commandVersion } from "./tool.js";
import type { LanguageAdapter, RunOptions, RunResult } from "./types.js";

// Python adapter (pytest). The target project's dependencies must be importable by the interpreter
// in DEJABUG_PYTHON (default: `python` on PATH), e.g. a venv with `pip install -r requirements-dev.txt`.
// The code under test always comes from the checked-out directory: it is put first on PYTHONPATH,
// so an installed copy of the package can never shadow the version being certified or played.

const execFileAsync = promisify(execFile);

function pythonCmd(): string {
  return process.env.DEJABUG_PYTHON || "python";
}

function defaultTestTimeoutSec(): number {
  const v = Number(process.env.DEJABUG_TEST_TIMEOUT_SEC);
  return Number.isFinite(v) && v > 0 ? v : 45;
}

const SKIP_DIRS = /^(docs?|examples?|scripts|build|dist|\.venv|venv|\.tox)\//;

export function isPyTestFile(file: string): boolean {
  const base = path.posix.basename(file);
  return base.endsWith(".py") && (base.startsWith("test_") || base.endsWith("_test.py"));
}

export function isPySourceFile(file: string): boolean {
  const base = path.posix.basename(file);
  return (
    file.endsWith(".py") &&
    !isPyTestFile(file) &&
    base !== "conftest.py" &&
    base !== "setup.py" &&
    !SKIP_DIRS.test(file) &&
    !/(^|\/)tests?\//.test(file)
  );
}

/**
 * Test names touched by a -U0 diff of Python test files: added `def test_x(` (module level or in a
 * class) and `class TestX` declarations, plus the enclosing test function or class named in a hunk
 * header when a hunk edits inside an existing test. Appended tests ignore the header.
 */
export function pyTestsTouched(diff: string): string[] {
  const names = new Set<string>();
  let headerTest: string | undefined;
  let hunkAddsTest = false;
  const close = () => {
    if (headerTest && !hunkAddsTest) names.add(headerTest);
    headerTest = undefined;
    hunkAddsTest = false;
  };
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      close();
      const m = /^@@ [^@]* @@ (?:async\s+)?(?:def (test\w*)\s*\(|class (Test\w*)\b)/.exec(line);
      headerTest = m?.[1] ?? m?.[2];
      continue;
    }
    if (line.startsWith("diff --git")) {
      close();
      continue;
    }
    const added = /^\+\s*(?:async\s+)?def (test\w*)\s*\(/.exec(line) ?? /^\+class (Test\w*)\b/.exec(line);
    if (added?.[1]) {
      names.add(added[1]);
      hunkAddsTest = true;
    }
  }
  close();
  return [...names].sort();
}

/** Maps pytest's exit code and output to a RunResult. */
export function classifyPytest(exitCode: number, output: string): RunResult {
  const failingTests = [
    ...new Set(
      [...output.matchAll(/^(?:FAILED|ERROR) \S+::(\S+?)(?:\[.*\])?(?: - .*)?$/gm)].map(
        (m) => m[1] as string,
      ),
    ),
  ];
  switch (exitCode) {
    case 0:
      return { outcome: "pass", output, failingTests: [] };
    case 1:
      return { outcome: "fail", output, failingTests };
    case 5:
      return { outcome: "notest", output, failingTests: [] };
    default:
      // 2: collection or import error, 3: internal error, 4: usage error (e.g. missing file)
      return { outcome: "build", output, failingTests };
  }
}

async function runPytest(
  dir: string,
  targets: string[],
  tests: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const testTimeoutSec = options.testTimeoutSec ?? defaultTestTimeoutSec();
  const processTimeoutMs = options.processTimeoutMs ?? testTimeoutSec * 1000;
  const args = ["-m", "pytest", "-q", "-rfE", "-p", "no:cacheprovider", "-k", tests.join(" or "), ...targets];
  const pythonPath = [dir, path.join(dir, "src"), process.env.PYTHONPATH]
    .filter(Boolean)
    .join(path.delimiter);

  try {
    const { stdout, stderr } = await execFileAsync(pythonCmd(), args, {
      cwd: dir,
      timeout: processTimeoutMs,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, PYTHONPATH: pythonPath, PYTHONDONTWRITEBYTECODE: "1" },
    });
    return classifyPytest(0, stdout + stderr);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      code?: unknown;
    };
    if (e.code === "ENOENT") throw new ToolMissingError(pythonCmd());
    const output = (e.stdout ?? "") + (e.stderr ?? "");
    // pytest has no built-in per-test timeout: a run that outlives the budget is a reproduced hang.
    if (e.killed)
      return {
        outcome: "hang",
        output: `${output}\n[killed after ${testTimeoutSec}s: hang]`,
        failingTests: [],
      };
    if (/No module named pytest/.test(output)) throw new ToolMissingError(`pytest (for ${pythonCmd()})`);
    return classifyPytest(typeof e.code === "number" ? e.code : 3, output);
  }
}

export const pythonAdapter: LanguageAdapter = {
  id: "python",
  name: "Python",
  detect: (repoDir) =>
    ["pyproject.toml", "setup.py", "setup.cfg", "pytest.ini", "tox.ini"].some((f) =>
      existsSync(path.join(repoDir, f)),
    ),
  isTestFile: isPyTestFile,
  isSourceFile: isPySourceFile,
  isRunnableTestFile: () => true,
  testsTouched: pyTestsTouched,
  testTargets: (testFiles) => [...new Set(testFiles)].sort(),
  runTests: runPytest,
  toolCheck: () => {
    const py = commandVersion(pythonCmd(), ["--version"]);
    if (!py) return { ok: false, detail: `${pythonCmd()} not found (set DEJABUG_PYTHON)` };
    const pytest = commandVersion(pythonCmd(), ["-m", "pytest", "--version"]);
    return pytest ? { ok: true, detail: `${py}, ${pytest}` } : { ok: false, detail: `${py} without pytest` };
  },
};
