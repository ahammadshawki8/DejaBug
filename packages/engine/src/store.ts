import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RankingFile } from "./assemble.js";
import type {
  CandidatesFile,
  Case,
  Certification,
  CertificationsFile,
  CertificationStatus,
  Funnel,
} from "./types.js";

// Persistence for cases/<repo>/: plain JSON files, atomic writes, no business logic.

const RESERVED = new Set(["candidates.json", "certifications.json", "funnel.json", "ranking.json"]);

export const ALL_STATUSES: CertificationStatus[] = [
  "certified",
  "rejected:build",
  "rejected:no-fail",
  "rejected:flaky",
  "rejected:no-pass",
  "rejected:timeout",
];

function readJson<T>(file: string): T | undefined {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

/** Writes JSON through a temp file and a rename, so readers never see a half-written file. */
export function writeJsonAtomic(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, file);
}

export function readCandidates(casesDir: string): CandidatesFile | undefined {
  return readJson<CandidatesFile>(path.join(casesDir, "candidates.json"));
}

export function readCertifications(casesDir: string): CertificationsFile | undefined {
  return readJson<CertificationsFile>(path.join(casesDir, "certifications.json"));
}

/** Local temp worktree prefixes (they contain the OS username). Stripped before anything is persisted. */
const LOCAL_WORKTREE_PATH = /(?:[A-Za-z]:)?[\\/](?:[^\\/\s"]+[\\/])*?dejabug-wt-[0-9a-f]+(?:-\d+)?[\\/]/g;

/** Home directories in any separator form (C:\Users\x, C:\\Users\\x, C:/Users/x, /home/x, /Users/x). */
const HOME_DIR = /(?:[A-Za-z]:(?:\\+|\/)|\/)(?:Users|home)(?:\\+|\/)[^\\/\s"'<>]+/gi;

export function stripLocalPaths(text: string): string {
  return (
    text
      .replace(LOCAL_WORKTREE_PATH, "")
      .replace(
        /(?:[A-Za-z]:)?(?:\\+|\/)(?:[^\\/\s"']+(?:\\+|\/))*?dejabug-wt-[0-9a-f]+(?:-\d+)?(?:\\+|\/)/g,
        "",
      )
      .replace(HOME_DIR, "~")
      // Leftover worktree fragments, e.g. truncated reprs like "~\\AppData\\Local\\Temp\\dejabug-wt-70cf...ca6e\\".
      .replace(
        /(?:~(?:\\+|\/))?(?:AppData(?:\\+|\/)Local(?:\\+|\/)Temp(?:\\+|\/))?dejabug-wt-[^\\/\s"']*(?:\\+|\/)?/g,
        "",
      )
  );
}

/** Merges new results into certifications.json (keyed by fixSha; newer results win). */
export function mergeCertifications(
  casesDir: string,
  repo: string,
  results: Certification[],
): CertificationsFile {
  const byId = new Map((readCertifications(casesDir)?.results ?? []).map((r) => [r.fixSha, r]));
  for (const r of results) {
    byId.set(r.fixSha, {
      ...r,
      failOutput: stripLocalPaths(r.failOutput),
      passOutput: stripLocalPaths(r.passOutput),
    });
  }
  const file: CertificationsFile = {
    repo,
    updatedAt: new Date().toISOString(),
    results: [...byId.values()],
  };
  writeJsonAtomic(path.join(casesDir, "certifications.json"), file);
  return file;
}

export function computeFunnel(candidates: CandidatesFile, results: Certification[]): Funnel {
  const byStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<CertificationStatus, number>;
  for (const r of results) byStatus[r.status]++;
  return {
    repo: candidates.repo,
    fixLikeCommits: candidates.fixLikeCommits,
    candidates: candidates.candidates.length,
    attempted: results.length,
    byStatus,
    generatedAt: new Date().toISOString(),
  };
}

export function readRanking(casesDir: string): RankingFile | undefined {
  return readJson<RankingFile>(path.join(casesDir, "ranking.json"));
}

export function readFunnel(casesDir: string): Funnel | undefined {
  return readJson<Funnel>(path.join(casesDir, "funnel.json"));
}

export function writeFunnel(casesDir: string, funnel: Funnel): void {
  writeJsonAtomic(path.join(casesDir, "funnel.json"), funnel);
}

export function readCases(casesDir: string): Case[] {
  if (!existsSync(casesDir)) return [];
  return readdirSync(casesDir)
    .filter((f) => f.endsWith(".json") && !RESERVED.has(f))
    .map((f) => readJson<Case>(path.join(casesDir, f)))
    .filter((c): c is Case => c?.status === "certified")
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function readCase(casesDir: string, id: string): Case | undefined {
  if (!/^[0-9a-f]{7,40}$/.test(id)) return undefined; // ids are short shas; blocks path tricks
  return readJson<Case>(path.join(casesDir, `${id}.json`));
}

export function writeCase(casesDir: string, c: Case): void {
  writeJsonAtomic(path.join(casesDir, `${c.id}.json`), c);
}
