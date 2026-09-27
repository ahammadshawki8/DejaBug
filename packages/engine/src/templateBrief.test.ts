import { describe, expect, it } from "vitest";
import { templateBrief } from "./templateBrief.js";
import type { Candidate, Certification } from "./types.js";

const candidate: Candidate = {
  fixSha: "a2b2b32aaaa",
  parentSha: "0000000",
  subject: "fix: Monotonicity in UUIDv7 (#150)",
  date: "2024-01-01T00:00:00Z",
  language: "go",
  sourceFiles: ["version7.go"],
  testFiles: ["uuid_test.go"],
  packages: ["."],
  tests: ["TestVersion7Monotonicity"],
};

const cert: Certification = {
  fixSha: "a2b2b32aaaa",
  status: "certified",
  failRuns: 3,
  passRuns: 1,
  failOutput: "--- FAIL: TestVersion7Monotonicity (0.00s)\n    uuid_test.go:893: monotonicity failed\nFAIL",
  passOutput: "ok",
  durationMs: 1,
};

const diff = [
  "diff --git a/version7.go b/version7.go",
  "@@ -10,6 +10,9 @@ func getV7Time() (milli, seq int64) {",
  "-	secretOldLine := 1",
  "+	secretNewIdentifier := 2",
  "+	anotherNewLine()",
].join("\n");

describe("templateBrief (no AI key)", () => {
  it("builds a playable case from the proof data", () => {
    const b = templateBrief(candidate, cert, diff);
    expect(b.codename).toBe("The Version 7 Monotonicity Case");
    expect(b.symptoms).toContain("TestVersion7Monotonicity fails");
    expect(b.evidence).toContain("monotonicity failed");
    expect(b.hints[1]).toContain("version7.go");
    expect(b.hints[2]).toContain("3 lines");
    expect(b.difficulty).toBe(1);
    expect(b.precinct).toBe("version7");
    expect(b.tags).toContain("no-ai");
  });

  it("never reveals what the fix adds", () => {
    const text = JSON.stringify(templateBrief(candidate, cert, diff));
    expect(text).not.toContain("secretNewIdentifier");
    expect(text).not.toContain("anotherNewLine");
  });

  it("names Python tests and hangs sensibly", () => {
    const py = {
      ...candidate,
      language: "python",
      sourceFiles: ["pkg/base_service.py"],
      tests: ["test_trailing_slash"],
    };
    const hung = { ...cert, failOutput: "[killed after 45s]" };
    const b = templateBrief(py, hung, diff);
    expect(b.codename).toBe("The Trailing Slash Case");
    expect(b.symptoms).toContain("hangs");
    expect(b.precinct).toBe("pkg");
  });
});
