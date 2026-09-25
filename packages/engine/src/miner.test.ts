import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixtureRepo, goFile, goTest } from "../test/fixture-repo.js";
import {
  extractPrNumber,
  hasBuildConstraint,
  isFixLike,
  mine,
  packageOf,
  testsTouched,
  type MineResult,
} from "./miner.js";

describe("miner helpers", () => {
  it("extracts the last (#NNN) PR reference", () => {
    expect(extractPrNumber("fix(client): only deregister the broker (#3752)")).toBe(3752);
    expect(extractPrNumber("fix: revert (#1) and reland (#42)")).toBe(42);
    expect(extractPrNumber("fix: no reference")).toBeUndefined();
  });

  it("maps files to go test package args", () => {
    expect(packageOf("client_test.go")).toBe(".");
    expect(packageOf("mocks/consumer_test.go")).toBe("./mocks");
  });

  it("finds added test functions and tests changed inside existing functions", () => {
    const diff = [
      "diff --git a/x_test.go b/x_test.go",
      "@@ -10,0 +11,3 @@ func TestExisting(t *testing.T) {",
      "+\tassert(t, x)",
      "@@ -40,0 +44,4 @@ import (",
      "+func TestAdded(t *testing.T) {",
      "+}",
    ].join("\n");
    expect(testsTouched(diff)).toEqual(["TestAdded", "TestExisting"]);
  });

  it("treats subject or body keywords as fix-like", () => {
    expect(isFixLike("fix(consumer): stop looping")).toBe(true);
    expect(isFixLike("Tighten bounds", "Fixes #7")).toBe(true);
    expect(isFixLike("Add debug logging", "prefix handling")).toBe(false);
    expect(isFixLike("chore: bump Go", "also fixes a flaky test")).toBe(false);
    expect(isFixLike("feat(client): new option", "Fixes #9")).toBe(false);
  });

  it("detects build constraints", () => {
    expect(hasBuildConstraint("//go:build functional\n\npackage sarama")).toBe(true);
    expect(hasBuildConstraint("// +build functional\n\npackage sarama")).toBe(true);
    expect(hasBuildConstraint("package sarama\n")).toBe(false);
  });
});

describe("mine (fixture repository)", () => {
  const repo = new FixtureRepo();
  const shas: Record<string, string> = {};
  let result: MineResult;

  beforeAll(async () => {
    repo.commit("initial import", {
      "a.go": goFile("demo", "func A() int { return 1 }\n"),
      "a_test.go": goFile("demo", 'import "testing"\n\n' + goTest("TestA")),
      "sub/b.go": goFile("sub", "func B() int { return 2 }\n"),
      "sub/b_test.go": goFile("sub", 'import "testing"\n\n' + goTest("TestB")),
    });

    // Kept: fix subject, 1 source file, a new test function, PR number.
    shas.newTest = repo.commit("fix: handle zero values (#12)", {
      "a.go": goFile("demo", "func A() int { return 2 }\n"),
      "a_test.go": goFile("demo", 'import "testing"\n\n' + goTest("TestA") + "\n" + goTest("TestZero")),
    });

    // Kept: change inside an existing test in a subpackage.
    shas.changedTest = repo.commit("Fix race in B", {
      "sub/b.go": goFile("sub", "func B() int { return 3 }\n"),
      "sub/b_test.go": goFile("sub", 'import "testing"\n\n' + goTest("TestB", '\tt.Log("changed")')),
    });

    // Kept: fix keyword only in the body (GitHub closing keyword).
    shas.bodyFix = repo.commit("Tighten A bounds\n\nFixes #7 where A overflowed.", {
      "a.go": goFile("demo", "func A() int { return 7 }\n"),
      "a_test.go": goFile(
        "demo",
        'import "testing"\n\n' + goTest("TestA") + "\n" + goTest("TestZero") + "\n" + goTest("TestBounds"),
      ),
    });

    // Dropped: not fix-like.
    repo.commit("feat: add C", {
      "c.go": goFile("demo", "func C() int { return 3 }\n"),
      "c_test.go": goFile("demo", 'import "testing"\n\n' + goTest("TestC")),
    });

    // Dropped: no test files.
    repo.commit("fix: typo in A", { "a.go": goFile("demo", "func A() int { return 4 }\n") });

    // Dropped: too many source files.
    repo.commit("fix: sweeping change", {
      "a.go": goFile("demo", "func A() int { return 5 }\n"),
      "c.go": goFile("demo", "func C() int { return 5 }\n"),
      "d.go": goFile("demo", "func D() int { return 5 }\n"),
      "e.go": goFile("demo", "func E() int { return 5 }\n"),
      "a_test.go": goFile("demo", 'import "testing"\n\n' + goTest("TestA", '\tt.Log("v5")')),
    });

    // Dropped: the only test file needs a build tag.
    repo.commit("fix: functional scenario", {
      "a.go": goFile("demo", "func A() int { return 6 }\n"),
      "functional_a_test.go":
        "//go:build functional\n\n" + goFile("demo", 'import "testing"\n\n' + goTest("TestFunctionalA")),
    });

    result = await mine(repo.dir);
  });

  afterAll(() => rmSync(repo.dir, { recursive: true, force: true }));

  it("counts scanned and fix-like commits", () => {
    expect(result.scannedCommits).toBe(8);
    expect(result.fixLikeCommits).toBe(6);
  });

  it("keeps only qualifying fix commits", () => {
    expect(result.candidates.map((c) => c.fixSha).sort()).toEqual(
      [shas.bodyFix, shas.changedTest, shas.newTest].sort(),
    );
  });

  it("records metadata for a new-test fix", () => {
    const c = result.candidates.find((x) => x.fixSha === shas.newTest);
    expect(c).toMatchObject({
      prNumber: 12,
      sourceFiles: ["a.go"],
      testFiles: ["a_test.go"],
      packages: ["."],
      tests: ["TestZero"],
    });
    expect(c?.parentSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("records a changed test in a subpackage", () => {
    const c = result.candidates.find((x) => x.fixSha === shas.changedTest);
    expect(c).toMatchObject({ packages: ["./sub"], tests: ["TestB"], prNumber: undefined });
  });

  it("keeps a body-only fix with its new test", () => {
    const c = result.candidates.find((x) => x.fixSha === shas.bodyFix);
    expect(c?.tests).toEqual(["TestBounds"]);
  });

  it("respects maxCommits", async () => {
    const limited = await mine(repo.dir, { maxCommits: 2 });
    expect(limited.scannedCommits).toBe(2);
  });
});
