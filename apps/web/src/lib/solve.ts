import type { CaseSession, PublicCase } from "../api/client";
import type { Profile, SolveRecord } from "../state/profile";
import { rankFor, scoreSolve, type XpBreakdown } from "./rules";

// Turning a verified solve into progression (PROJECT.md Section 6). Pure, unit-tested.

export function solveSeconds(session: CaseSession): number {
  if (!session.startedAt || !session.solvedAt) return 0;
  return Math.max(0, Math.round((Date.parse(session.solvedAt) - Date.parse(session.startedAt)) / 1000));
}

export interface SolveOutcome {
  profile: Profile;
  record: SolveRecord;
  breakdown: XpBreakdown;
  rankUp: boolean;
  firstSolve: boolean;
}

/** Records a solve once per case (replays never farm XP) and reports rank-ups. */
export function applySolve(profile: Profile, c: PublicCase, session: CaseSession): SolveOutcome {
  const seconds = solveSeconds(session);
  const breakdown = scoreSolve(c.brief.difficulty, session.hintsRevealed, seconds, c.parSeconds);
  const existing = profile.solves.find((s) => s.caseId === c.id && s.repo === c.repo);
  if (existing) {
    return { profile, record: existing, breakdown, rankUp: false, firstSolve: false };
  }
  const record: SolveRecord = {
    caseId: c.id,
    repo: c.repo,
    xp: breakdown.total,
    seconds,
    hints: session.hintsRevealed,
    solvedAt: session.solvedAt ?? new Date().toISOString(),
  };
  const before = rankFor(profile.xp).rank.id;
  const next: Profile = { ...profile, xp: profile.xp + record.xp, solves: [...profile.solves, record] };
  return {
    profile: next,
    record,
    breakdown,
    rankUp: rankFor(next.xp).rank.id !== before,
    firstSolve: profile.solves.length === 0,
  };
}

/** Lines added plus removed in a unified diff (ignores file headers). */
export function changedLines(diff: string): number {
  return diff.split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l)).length;
}

export function formatDays(days?: number): string {
  if (days === undefined) return "n/a";
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} hours`;
  return `${days.toFixed(days < 10 ? 1 : 0)} days`;
}
