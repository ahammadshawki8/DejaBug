import type { BadgeId } from "../art/sprites";
import type { PublicCase } from "../api/client";
import type { Profile, SolveRecord } from "../state/profile";

// Badge rules (PROJECT.md Section 6). Pure functions over the profile and the case list.

export interface BadgeDef {
  id: BadgeId;
  name: string;
  description: string;
}

export const BADGES: BadgeDef[] = [
  { id: "cold-case-closed", name: "Cold Case Closed", description: "Close your first case." },
  { id: "clean-hands", name: "Clean Hands", description: "Close a case without opening a hint." },
  { id: "beat-the-clock", name: "Beat the Clock", description: "Close a case under par time." },
  {
    id: "race-hunter",
    name: "Race Hunter",
    description: "Close a concurrency case: a race, deadlock or hang.",
  },
  { id: "protocol-whisperer", name: "Protocol Whisperer", description: "Close three protocol cases." },
  { id: "precinct-master", name: "Precinct Master", description: "Close every case in one precinct." },
  {
    id: "faster-than-original",
    name: "Faster Than The Original",
    description: "Close a case in under 1% of the time the original team needed.",
  },
];

const CONCURRENCY = /race|deadlock|concurren|goroutine|hang|mutex|lock|sync|timeout|retry/i;

/** True when a solved case counts as a concurrency case (tags, precinct or codename). */
export function isConcurrencyCase(c: Pick<PublicCase, "brief">): boolean {
  return [...c.brief.tags, c.brief.precinct, c.brief.codename].some((t) => CONCURRENCY.test(t));
}

function earned(id: BadgeId, profile: Profile, cases: PublicCase[], byKey: Map<string, PublicCase>): boolean {
  const solved = profile.solves
    .map((s) => ({ s, c: byKey.get(`${s.repo}/${s.caseId}`) }))
    .filter((x): x is { s: SolveRecord; c: PublicCase } => Boolean(x.c));
  switch (id) {
    case "cold-case-closed":
      return profile.solves.length > 0;
    case "clean-hands":
      return profile.solves.some((s) => s.hints === 0);
    case "beat-the-clock":
      return solved.some(({ s, c }) => s.seconds < c.parSeconds);
    case "race-hunter":
      return solved.some(({ c }) => isConcurrencyCase(c));
    case "protocol-whisperer":
      return solved.filter(({ c }) => c.brief.precinct.toLowerCase().includes("protocol")).length >= 3;
    case "precinct-master": {
      const precincts = new Set(cases.map((c) => `${c.repo}/${c.brief.precinct}`));
      return [...precincts].some((p) => {
        const inP = cases.filter((c) => `${c.repo}/${c.brief.precinct}` === p);
        return (
          inP.length > 0 &&
          inP.every(
            (c) =>
              byKey.has(`${c.repo}/${c.id}`) &&
              profile.solves.some((s) => s.caseId === c.id && s.repo === c.repo),
          )
        );
      });
    }
    case "faster-than-original":
      return solved.some(
        ({ s, c }) => c.original.daysOpen !== undefined && s.seconds < c.original.daysOpen * 86400 * 0.01,
      );
  }
}

/** Badges the profile has earned given the known cases (cases from any repository may be passed). */
export function earnedBadges(profile: Profile, cases: PublicCase[]): BadgeId[] {
  const byKey = new Map(cases.map((c) => [`${c.repo}/${c.id}`, c]));
  return BADGES.filter((b) => earned(b.id, profile, cases, byKey)).map((b) => b.id);
}

/** Adds newly earned badges to the profile. Returns the new profile and the badges just unlocked. */
export function awardBadges(
  profile: Profile,
  cases: PublicCase[],
): { profile: Profile; unlocked: BadgeId[] } {
  const have = new Set(profile.badges);
  const unlocked = earnedBadges(profile, cases).filter((b) => !have.has(b));
  return { profile: { ...profile, badges: [...profile.badges, ...unlocked] }, unlocked };
}
