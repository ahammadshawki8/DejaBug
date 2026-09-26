import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toPublicCase } from "./server.js";
import { readCandidates, readCases, readCertifications, readFunnel } from "./store.js";
import type { OriginalEffort } from "./types.js";

// Static export for the public showcase build (PROJECT.md T9.5, 4.2 W7). Everything a judge can click
// through without the engine: public cases, reveals, and the REAL recorded certification runs, which the
// showcase replays (and labels as replays).

export interface ShowcaseReveal {
  fixDiff: string;
  lesson: string;
  hints: [string, string, string];
  original: OriginalEffort;
  prNumber?: number;
  failOutput: string; // recorded failing run (before the fix)
  passOutput: string; // recorded passing run (after the fix)
}

export interface ShowcaseForgeRecord {
  fixSha: string;
  subject: string;
  status: string;
  failRuns: number;
  passRuns: number;
  codename?: string;
}

function write(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data));
}

export function exportShowcase(
  casesRoot: string,
  outDir: string,
  defaultRepo: string,
): { repos: number; cases: number } {
  rmSync(outDir, { recursive: true, force: true });
  let total = 0;
  const repos = [];
  for (const name of existsSync(casesRoot) ? readdirSync(casesRoot) : []) {
    const dir = path.join(casesRoot, name);
    const cases = readCases(dir);
    if (!cases.length) continue;
    const candidates = readCandidates(dir);
    const funnel = readFunnel(dir) ?? null;
    repos.push({
      name,
      slug: candidates?.repo ?? name,
      language: candidates?.language,
      caseCount: cases.length,
      funnel,
      default: name === defaultRepo,
    });
    write(path.join(outDir, name, "cases.json"), cases.map(toPublicCase));
    for (const c of cases) {
      const reveal: ShowcaseReveal = {
        fixDiff: c.fixDiff,
        lesson: c.brief.lesson,
        hints: c.brief.hints,
        original: c.original,
        prNumber: c.prNumber,
        failOutput: c.certification.failOutput,
        passOutput: c.certification.passOutput,
      };
      write(path.join(outDir, name, `${c.id}.json`), reveal);
    }
    // The forge replay: real certification outcomes, in the order they were attempted.
    const subjects = new Map((candidates?.candidates ?? []).map((x) => [x.fixSha, x.subject]));
    const codenames = new Map(cases.map((c) => [c.fixSha, c.brief.codename]));
    const records: ShowcaseForgeRecord[] = (readCertifications(dir)?.results ?? []).slice(0, 40).map((r) => ({
      fixSha: r.fixSha,
      subject: subjects.get(r.fixSha) ?? "",
      status: r.status,
      failRuns: r.failRuns,
      passRuns: r.passRuns,
      codename: codenames.get(r.fixSha),
    }));
    write(path.join(outDir, name, "forge.json"), records);
    total += cases.length;
  }
  write(path.join(outDir, "repos.json"), repos);
  return { repos: repos.length, cases: total };
}
