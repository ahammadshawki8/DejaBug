import { describe, expect, it } from "vitest";
import { rankFor, scoreSolve } from "./rules";

describe("rankFor", () => {
  it("maps XP to ranks with progress toward the next", () => {
    expect(rankFor(0).rank.name).toBe("Rookie");
    expect(rankFor(299).rank.name).toBe("Rookie");
    expect(rankFor(300).rank.name).toBe("Detective");
    expect(rankFor(600).progress).toBeCloseTo(0.5);
    expect(rankFor(5000)).toMatchObject({ rank: { name: "Commissioner" }, next: undefined, progress: 1 });
  });
});

describe("scoreSolve", () => {
  it("rewards clean fast solves", () => {
    // difficulty 2: base 200, no hints, half the par used: +50 bonus, x1.2
    expect(scoreSolve(2, 0, 600, 1200)).toMatchObject({ base: 200, timeBonus: 50, total: 300 });
  });

  it("charges 25% of base per hint and gives no bonus past par", () => {
    expect(scoreSolve(1, 2, 2000, 600)).toMatchObject({ hintPenalty: 50, timeBonus: 0, total: 50 });
    expect(scoreSolve(1, 3, 2000, 600).total).toBe(25);
  });
});
