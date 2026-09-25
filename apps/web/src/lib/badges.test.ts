import { describe, expect, it } from "vitest";
import type { PublicCase } from "../api/client";
import type { Profile } from "../state/profile";
import { awardBadges, earnedBadges, isConcurrencyCase } from "./badges";

function kase(id: string, precinct: string, tags: string[] = [], daysOpen = 2, par = 1200): PublicCase {
  return {
    id,
    repo: "IBM/sarama",
    parSeconds: par,
    original: { mergedAt: "", daysOpen },
    brief: { codename: `Case ${id}`, precinct, tags, difficulty: 1, symptoms: "", evidence: "" },
  } as unknown as PublicCase;
}

const cases = [
  kase("a", "protocol"),
  kase("b", "protocol"),
  kase("c", "protocol"),
  kase("d", "producer", ["deadlock"]),
];

function profileWith(solves: [string, number, number][]): Profile {
  return {
    name: "x",
    xp: 0,
    badges: [],
    solves: solves.map(([caseId, seconds, hints]) => ({
      caseId,
      repo: "IBM/sarama",
      xp: 100,
      seconds,
      hints,
      solvedAt: "2026-09-26T00:00:00Z",
    })),
  };
}

describe("badges", () => {
  it("detects concurrency cases from tags or names", () => {
    expect(isConcurrencyCase(kase("x", "producer", ["deadlock"]))).toBe(true);
    expect(isConcurrencyCase(kase("x", "protocol", ["decoder"]))).toBe(false);
  });

  it("earns first-solve, clean, clock and speed badges", () => {
    const got = earnedBadges(profileWith([["a", 600, 0]]), cases);
    expect(got).toEqual(
      expect.arrayContaining(["cold-case-closed", "clean-hands", "beat-the-clock", "faster-than-original"]),
    );
    expect(got).not.toContain("protocol-whisperer");
  });

  it("earns precinct badges and reports only new unlocks", () => {
    const p = profileWith([
      ["a", 5000, 1],
      ["b", 5000, 1],
      ["c", 5000, 2],
      ["d", 5000, 3],
    ]);
    const first = awardBadges(p, cases);
    expect(first.unlocked).toEqual(
      expect.arrayContaining(["protocol-whisperer", "precinct-master", "race-hunter"]),
    );
    expect(first.unlocked).not.toContain("clean-hands");
    expect(awardBadges(first.profile, cases).unlocked).toEqual([]);
  });
});
