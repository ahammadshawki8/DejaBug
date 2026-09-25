import { git } from "./git.js";
import { stripLocalPaths } from "./store.js";
import type { Brief, Candidate, Case, Certification, Difficulty, OriginalEffort } from "./types.js";

// Assembles a finished training case from the pipeline's parts (PROJECT.md 4.1, Section 5 Case).

/** Output of Bob's T3.4 subagent ranking (cases/<repo>/ranking.json). */
export interface RankingEntry {
  fixSha: string; // 7-char prefix
  teachingValue: number;
  difficulty: Difficulty;
  precinct: string;
  reason: string; // internal only: may hint at the fix, never shown before a solve
}

export interface RankingFile {
  repo: string;
  generatedAt: string;
  cases: RankingEntry[];
}

/** Par time grows with difficulty: 10, 20, 30 minutes. */
export function parSecondsFor(difficulty: Difficulty): number {
  return difficulty * 10 * 60;
}

export interface OldRange {
  file: string;
  start: number;
  count: number;
}

/** Old-side line ranges touched by a unified diff: the lines as they were in the buggy version. */
export function oldRanges(diff: string): OldRange[] {
  const ranges: OldRange[] = [];
  let file: string | undefined;
  for (const line of diff.split("\n")) {
    const header = /^--- a\/(.+)$/.exec(line);
    if (header) {
      file = header[1];
      continue;
    }
    if (line.startsWith("--- /dev/null")) {
      file = undefined;
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+/.exec(line);
    if (hunk && file) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      // A pure insertion (count 0) is anchored to the line above it.
      ranges.push({ file, start: Math.max(1, start), count: Math.max(1, count) });
    }
  }
  return ranges;
}

/**
 * Approximate age of the bug: days between the fix and the most recent change to the lines the
 * fix touched, as of the parent commit ("Cold for N days" on the case board).
 */
export async function bugAgeDays(repoDir: string, candidate: Candidate, sourceDiff: string): Promise<number> {
  let introduced = 0;
  for (const r of oldRanges(sourceDiff)) {
    const out = await git(repoDir, [
      "blame",
      "--porcelain",
      "-L",
      `${r.start},+${r.count}`,
      candidate.parentSha,
      "--",
      r.file,
    ]).catch(() => "");
    for (const m of out.matchAll(/^committer-time (\d+)$/gm)) introduced = Math.max(introduced, Number(m[1]));
  }
  if (!introduced) return 0;
  const fixed = new Date(candidate.date).getTime() / 1000;
  return Math.max(0, Math.round((fixed - introduced) / 86400));
}

export interface AssembleInput {
  repo: string;
  candidate: Candidate;
  certification: Certification;
  brief: Brief;
  ranking?: RankingEntry;
  prNumber?: number;
  original: OriginalEffort;
  bugAgeDays: number;
  fixDiff: string;
  briefedBy?: string;
}

/** Builds the Case JSON. Ranking (from Bob's subagents) wins for difficulty and precinct. */
export function assembleCase(input: AssembleInput): Case {
  const { candidate, certification, ranking } = input;
  const difficulty = ranking?.difficulty ?? input.brief.difficulty;
  return {
    id: candidate.fixSha.slice(0, 7),
    repo: input.repo,
    language: candidate.language,
    fixSha: candidate.fixSha,
    parentSha: candidate.parentSha,
    prNumber: input.prNumber ?? candidate.prNumber,
    status: "certified",
    tests: candidate.tests,
    packages: candidate.packages,
    certification: {
      failRuns: certification.failRuns,
      passRuns: certification.passRuns,
      failOutput: stripLocalPaths(certification.failOutput),
      passOutput: stripLocalPaths(certification.passOutput),
      durationMs: certification.durationMs,
    },
    brief: { ...input.brief, difficulty, precinct: ranking?.precinct ?? input.brief.precinct },
    original: input.original,
    bugAgeDays: input.bugAgeDays,
    briefedBy: input.briefedBy,
    parSeconds: parSecondsFor(difficulty),
    fixDiff: input.fixDiff,
  };
}
