import { describe, expect, it } from "vitest";
import type { CaseSession, PublicCase } from "../api/client";
import type { Profile } from "../state/profile";
import { applySolve, changedLines, formatDays, solveSeconds } from "./solve";

const c = {
  id: "abc1234",
  repo: "IBM/sarama",
  parSeconds: 1200,
  brief: { difficulty: 2 },
} as unknown as PublicCase;
const session: CaseSession = {
  caseId: "abc1234",
  repo: "IBM/sarama",
  hintsRevealed: 0,
  verifyRuns: 2,
  startedAt: "2026-09-26T10:00:00Z",
  solvedAt: "2026-09-26T10:10:00Z",
};
const empty: Profile = { name: "Rookie", xp: 0, solves: [], badges: [] };

describe("applySolve", () => {
  it("awards XP once, records time and hints, and detects the first rank-up", () => {
    expect(solveSeconds(session)).toBe(600);
    const out = applySolve(empty, c, session);
    expect(out.record).toMatchObject({ caseId: "abc1234", seconds: 600, hints: 0, xp: 300 });
    expect(out.profile.xp).toBe(300);
    expect(out.rankUp).toBe(true); // 0 -> 300 XP: Rookie to Detective
    expect(out.firstSolve).toBe(true);

    const again = applySolve(out.profile, c, session);
    expect(again.profile.xp).toBe(300);
    expect(again.firstSolve).toBe(false);
  });
});

describe("helpers", () => {
  it("counts changed lines without file headers", () => {
    expect(changedLines("--- a/x.go\n+++ b/x.go\n@@ -1 +1 @@\n-a\n+b\n context")).toBe(2);
  });

  it("formats original durations", () => {
    expect(formatDays(0.4)).toBe("10 hours");
    expect(formatDays(1.7)).toBe("1.7 days");
    expect(formatDays(14.9)).toBe("15 days");
    expect(formatDays(undefined)).toBe("n/a");
  });
});
