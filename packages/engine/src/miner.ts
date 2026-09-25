import path from "node:path";
import { git } from "./git.js";
import type { Candidate } from "./types.js";

/** Subject keywords that mark a commit as a bug fix (PROJECT.md 4.1 F1). */
export const FIX_PATTERN = /\b(fix(e[sd])?|bug|panic|race|deadlock|leak|crash|regression)\b/i;

export const MAX_SOURCE_FILES = 3;

export interface MineOptions {
  /** Only consider the most recent N commits (useful for tests and quick runs). */
  maxCommits?: number;
}

export interface MineResult {
  scannedCommits: number;
  fixLikeCommits: number;
  candidates: Candidate[];
}

interface LogEntry {
  sha: string;
  parents: string[];
  date: string;
  subject: string;
  body: string;
  files: string[];
}

const RECORD = "\x1e";
const FIELD = "\x1f";
const END_META = "\x1d";

/** Conventional Commit types that are never bug fixes, even if the body mentions one. */
const NON_FIX_TYPE = /^(feat|chore|docs|ci|build|test|refactor|style|perf|revert)(\(.*?\))?!?:/i;

/**
 * A commit is fix-like when its subject says so, or when its body does ("Fixes #123")
 * and the subject is not explicitly a non-fix Conventional Commit type.
 */
export function isFixLike(subject: string, body = ""): boolean {
  if (FIX_PATTERN.test(subject)) return true;
  return FIX_PATTERN.test(body) && !NON_FIX_TYPE.test(subject);
}

export function isTestFile(file: string): boolean {
  return file.endsWith("_test.go");
}

export function isSourceFile(file: string): boolean {
  return file.endsWith(".go") && !isTestFile(file) && !file.startsWith("vendor/");
}

export function extractPrNumber(subject: string): number | undefined {
  const matches = [...subject.matchAll(/\(#(\d+)\)/g)];
  const last = matches.at(-1);
  return last ? Number(last[1]) : undefined;
}

/** Go package argument for a file: "." for the repo root, "./dir" otherwise. */
export function packageOf(file: string): string {
  const dir = path.posix.dirname(file);
  return dir === "." ? "." : `./${dir}`;
}

/**
 * Test function names touched by a unified diff (-U0) of test files: functions whose
 * `func TestX(` line is added, plus the enclosing function named in a hunk header when
 * the hunk edits inside an existing test. A hunk that adds its own test declaration is
 * an append, so its header (which names the previous function) is ignored.
 */
export function testsTouched(diff: string): string[] {
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

/** True when a Go file needs build tags to compile (for example sarama's functional tests). */
export function hasBuildConstraint(content: string): boolean {
  return /^\/\/go:build\s/m.test(content) || /^\/\/ \+build\s/m.test(content);
}

export function parseLog(raw: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const chunk of raw.split(RECORD)) {
    if (!chunk.trim()) continue;
    const [meta = "", filesPart = ""] = chunk.split(END_META);
    const [sha = "", parents = "", date = "", subject = "", body = ""] = meta.split(FIELD);
    if (!sha) continue;
    entries.push({
      sha: sha.trim(),
      parents: parents.split(" ").filter(Boolean),
      date,
      subject,
      body: body.trim(),
      files: filesPart
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean),
    });
  }
  return entries;
}

/** Mines fix-like commits that change tests plus 1-3 source files (PROJECT.md 4.1 F1). */
export async function mine(repoDir: string, options: MineOptions = {}): Promise<MineResult> {
  const format = `--format=${RECORD}%H${FIELD}%P${FIELD}%cI${FIELD}%s${FIELD}%b${END_META}`;
  const args = ["log", "--no-merges", "--name-only", format];
  if (options.maxCommits) args.push(`-n${options.maxCommits}`);
  const entries = parseLog(await git(repoDir, args));

  const fixLike = entries.filter((e) => isFixLike(e.subject, e.body) && e.parents.length === 1);
  const candidates: Candidate[] = [];

  for (const e of fixLike) {
    const sourceFiles = e.files.filter(isSourceFile);
    const allTestFiles = e.files.filter(isTestFile);
    if (sourceFiles.length < 1 || sourceFiles.length > MAX_SOURCE_FILES || allTestFiles.length < 1) continue;

    const testFiles: string[] = [];
    for (const file of allTestFiles) {
      const content = await git(repoDir, ["show", `${e.sha}:${file}`]).catch(() => "");
      if (content && !hasBuildConstraint(content)) testFiles.push(file);
    }
    if (testFiles.length === 0) continue;

    const diff = await git(repoDir, ["show", "--format=", "-U0", e.sha, "--", ...testFiles]);
    const tests = testsTouched(diff);
    if (tests.length === 0) continue;

    candidates.push({
      fixSha: e.sha,
      parentSha: e.parents[0] as string,
      subject: e.subject,
      date: e.date,
      prNumber: extractPrNumber(e.subject),
      sourceFiles,
      testFiles,
      packages: [...new Set(testFiles.map(packageOf))].sort(),
      tests,
    });
  }

  return { scannedCommits: entries.length, fixLikeCommits: fixLike.length, candidates };
}
