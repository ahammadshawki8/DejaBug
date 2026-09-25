import { rmSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { FixtureRepo } from "../test/fixture-repo.js";
import { assembleCase, bugAgeDays, oldRanges, parSecondsFor } from "./assemble.js";
import type { Brief, Candidate, Certification } from "./types.js";

describe("oldRanges", () => {
  it("reads old-side hunk ranges per file, anchoring pure insertions", () => {
    const diff = [
      "diff --git a/client.go b/client.go",
      "--- a/client.go",
      "+++ b/client.go",
      "@@ -10,3 +10,4 @@ func x() {",
      "@@ -40,0 +42,2 @@",
      "diff --git a/new.go b/new.go",
      "--- /dev/null",
      "+++ b/new.go",
      "@@ -0,0 +1,5 @@",
    ].join("\n");
    expect(oldRanges(diff)).toEqual([
      { file: "client.go", start: 10, count: 3 },
      { file: "client.go", start: 40, count: 1 },
    ]);
  });
});

describe("bugAgeDays", () => {
  const repo = new FixtureRepo();
  afterAll(() => rmSync(repo.dir, { recursive: true, force: true }));

  it("measures days between the last change to the buggy lines and the fix", async () => {
    const day = 86400;
    const t0 = 1_700_000_000;
    const parent = repo.commit("add buggy code", { "a.go": "package a\n\nfunc A() int { return 1 }\n" }, t0);
    const fix = repo.commit("fix A", { "a.go": "package a\n\nfunc A() int { return 2 }\n" }, t0 + 30 * day);

    const diff = repo.git("diff", parent, fix, "--", "a.go");
    const candidate = {
      parentSha: parent,
      date: new Date((t0 + 30 * day) * 1000).toISOString(),
    } as Candidate;
    expect(await bugAgeDays(repo.dir, candidate, diff)).toBe(30);
  });
});

describe("assembleCase", () => {
  const brief: Brief = {
    codename: "The Phantom Slice",
    symptoms: "s",
    evidence: "e",
    hints: ["a", "b", "c"],
    difficulty: 1,
    precinct: "metadata",
    lesson: "l",
    tags: ["t"],
  };
  const candidate = {
    fixSha: "fc4202228d963849541aa1ceaff4eeac4a644a46",
    parentSha: "p".repeat(40),
    subject: "fix",
    date: "2026-05-26T00:00:00Z",
    prNumber: undefined,
    language: "go",
    sourceFiles: ["real_decoder.go"],
    testFiles: ["real_decoder_test.go"],
    packages: ["."],
    tests: ["TestX"],
  } satisfies Candidate;
  const certification: Certification = {
    fixSha: candidate.fixSha,
    status: "certified",
    failRuns: 3,
    passRuns: 1,
    failOutput: "C:/Users/me/AppData/Local/Temp/dejabug-wt-fc42/real_decoder_test.go:70: got -1",
    passOutput: "ok",
    durationMs: 7000,
  };

  it("lets the subagent ranking set difficulty and precinct, and derives par time", () => {
    const c = assembleCase({
      repo: "IBM/sarama",
      candidate,
      certification,
      brief,
      ranking: { fixSha: "fc42022", teachingValue: 5, difficulty: 3, precinct: "protocol", reason: "r" },
      prNumber: 3579,
      original: { mergedAt: "2026-05-26T00:00:00Z", daysOpen: 1.7 },
      bugAgeDays: 400,
      fixDiff: "diff",
    });
    expect(c).toMatchObject({
      id: "fc42022",
      prNumber: 3579,
      language: "go",
      bugAgeDays: 400,
      parSeconds: 1800,
    });
    expect(c.brief).toMatchObject({ difficulty: 3, precinct: "protocol", codename: "The Phantom Slice" });
    expect(c.certification.failOutput).toBe("real_decoder_test.go:70: got -1");
  });

  it("falls back to the brief without a ranking", () => {
    const c = assembleCase({
      repo: "o/r",
      candidate,
      certification,
      brief,
      original: { mergedAt: "x" },
      bugAgeDays: 0,
      fixDiff: "",
    });
    expect(c.brief.precinct).toBe("metadata");
    expect(parSecondsFor(1)).toBe(600);
  });
});
