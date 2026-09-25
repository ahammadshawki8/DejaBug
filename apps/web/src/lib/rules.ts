import type { RankId } from "../art/sprites";

// Game rules (PROJECT.md Section 6). Pure functions, unit-tested.

export interface Rank {
  id: RankId;
  name: string;
  minXp: number;
}

export const RANKS: Rank[] = [
  { id: "rookie", name: "Rookie", minXp: 0 },
  { id: "detective", name: "Detective", minXp: 300 },
  { id: "inspector", name: "Inspector", minXp: 900 },
  { id: "chief", name: "Chief Inspector", minXp: 2000 },
  { id: "commissioner", name: "Commissioner", minXp: 4000 },
];

export function rankFor(xp: number): { rank: Rank; next?: Rank; progress: number } {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= (RANKS[i + 1] as Rank).minXp) i++;
  const rank = RANKS[i] as Rank;
  const next = RANKS[i + 1];
  const progress = next ? (xp - rank.minXp) / (next.minXp - rank.minXp) : 1;
  return { rank, next, progress: Math.min(1, Math.max(0, progress)) };
}

/** Base reward by difficulty: 100 / 200 / 300 XP. */
export function baseXp(difficulty: number): number {
  return Math.max(1, Math.min(3, difficulty)) * 100;
}

export interface XpBreakdown {
  base: number;
  hintPenalty: number;
  timeBonus: number;
  cleanMultiplier: number;
  total: number;
}

/**
 * XP for a solve: each hint costs 25% of base; up to +50% for finishing under par (linear in the time
 * saved); a no-hint solve is multiplied by 1.2. Never negative.
 */
export function scoreSolve(
  difficulty: number,
  hintsUsed: number,
  seconds: number,
  parSeconds: number,
): XpBreakdown {
  const base = baseXp(difficulty);
  const hintPenalty = Math.round(base * 0.25 * hintsUsed);
  const underPar = parSeconds > 0 ? Math.max(0, (parSeconds - seconds) / parSeconds) : 0;
  const timeBonus = Math.round(base * 0.5 * underPar);
  const cleanMultiplier = hintsUsed === 0 ? 1.2 : 1;
  const total = Math.max(0, Math.round((base - hintPenalty + timeBonus) * cleanMultiplier));
  return { base, hintPenalty, timeBonus, cleanMultiplier, total };
}

/** XP still on the table right now: what the Investigation meter shows as it drains. */
export function remainingXp(
  difficulty: number,
  hintsUsed: number,
  seconds: number,
  parSeconds: number,
): number {
  return scoreSolve(difficulty, hintsUsed, seconds, parSeconds).total;
}
