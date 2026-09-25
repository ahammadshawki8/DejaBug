import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixtureRepo, goFile, goTest } from "../test/fixture-repo.js";
import { ToolMissingError } from "./adapters/errors.js";
import { goAdapter } from "./adapters/go.js";
import { ADAPTERS } from "./adapters/index.js";
import type { LanguageAdapter } from "./adapters/types.js";
import { certify } from "./certifier.js";
import type { Candidate, Certification, ForgeEvent } from "./types.js";

function hasGo(): boolean {
  try {
    execFileSync("go", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const TESTING = 'import "testing"\n\n';

describe.skipIf(!hasGo())("certify (Go fixture repository)", () => {
  const repo = new FixtureRepo();
  const candidates: Record<string, Candidate> = {};
  const events: ForgeEvent[] = [];
  let results: Map<string, Certification>;

  function candidate(name: string, fixSha: string, tests: string[], sourceFiles = ["calc.go"]): void {
    candidates[name] = {
      fixSha,
      parentSha: repo.git("rev-parse", `${fixSha}^`).trim(),
      subject: name,
      date: new Date().toISOString(),
      language: "go",
      sourceFiles,
      testFiles: ["calc_test.go"],
      packages: ["."],
      tests,
    };
  }

  beforeAll(async () => {
    repo.commit("initial", {
      "go.mod": "module fixture\n\ngo 1.22\n",
      "calc.go": goFile("calc", "func Add(a, b int) int { return a - b }\n\nfunc Two() int { return 2 }\n"),
      "calc_test.go": goFile(
        "calc",
        TESTING + goTest("TestTwo", "\tif Two() != 2 {\n\t\tt.Fatal(Two())\n\t}"),
      ),
    });

    // certified: the new test fails on the buggy Add and passes on the fix.
    const addTest = goTest("TestAdd", "\tif Add(2, 3) != 5 {\n\t\tt.Fatal(Add(2, 3))\n\t}");
    candidate(
      "certified",
      repo.commit("fix: Add subtracts", {
        "calc.go": goFile("calc", "func Add(a, b int) int { return a + b }\n\nfunc Two() int { return 2 }\n"),
        "calc_test.go": goFile(
          "calc",
          TESTING + goTest("TestTwo", "\tif Two() != 2 {\n\t\tt.Fatal(Two())\n\t}") + "\n" + addTest,
        ),
      }),
      ["TestAdd"],
    );

    // rejected:build: the test calls a function that only the fix introduces.
    candidate(
      "build",
      repo.commit("fix: add Sub", {
        "calc.go": goFile(
          "calc",
          "func Add(a, b int) int { return a + b }\n\nfunc Two() int { return 2 }\n\nfunc Sub(a, b int) int { return a - b }\n",
        ),
        "calc_test.go": goFile(
          "calc",
          TESTING + addTest + "\n" + goTest("TestSub", "\tif Sub(3, 1) != 2 {\n\t\tt.Fatal()\n\t}"),
        ),
      }),
      ["TestSub"],
    );

    // rejected:no-fail: the test already passes before the fix.
    candidate(
      "noFail",
      repo.commit("fix: document Two", {
        "calc.go": goFile(
          "calc",
          "func Add(a, b int) int { return a + b }\n\n// Two returns 2.\nfunc Two() int { return 2 }\n\nfunc Sub(a, b int) int { return a - b }\n",
        ),
        "calc_test.go": goFile("calc", TESTING + addTest + "\n" + goTest("TestTwoAgain", "\t_ = Two()")),
      }),
      ["TestTwoAgain"],
    );

    // rejected:no-pass: the test still fails after the "fix".
    candidate(
      "noPass",
      repo.commit("fix: attempt at Three", {
        "calc.go": goFile(
          "calc",
          "func Add(a, b int) int { return a + b }\n\n// Two returns 2.\nfunc Two() int { return 2 }\n\nfunc Sub(a, b int) int { return a - b }\n\n// Three is still wrong.\n",
        ),
        "calc_test.go": goFile(
          "calc",
          TESTING + addTest + "\n" + goTest("TestThree", "\tif Two()+1 != 4 {\n\t\tt.Fatal()\n\t}"),
        ),
      }),
      ["TestThree"],
    );

    // Hang: the buggy Wait blocks forever, the fix returns. Hangs count as reproduced failures.
    repo.commit("feat: add Wait", {
      "calc.go": goFile(
        "calc",
        "func Add(a, b int) int { return a + b }\n\nfunc Two() int { return 2 }\n\nfunc Sub(a, b int) int { return a - b }\n\nfunc Wait() int { ch := make(chan int); return <-ch }\n",
      ),
    });
    candidate(
      "hang",
      repo.commit("fix: Wait deadlocks", {
        "calc.go": goFile(
          "calc",
          "func Add(a, b int) int { return a + b }\n\nfunc Two() int { return 2 }\n\nfunc Sub(a, b int) int { return a - b }\n\nfunc Wait() int { return 1 }\n",
        ),
        "calc_test.go": goFile(
          "calc",
          TESTING + goTest("TestWait", "\tif Wait() != 1 {\n\t\tt.Fatal()\n\t}"),
        ),
      }),
      ["TestWait"],
    );

    // Test names that do not exist: rejected, never certified.
    candidate("missingTest", candidates.certified!.fixSha, ["TestDoesNotExist"]);

    const emitter = new EventEmitter();
    emitter.on("forge", (e: ForgeEvent) => events.push(e));

    const list = [
      candidates.certified!,
      candidates.build!,
      candidates.noFail!,
      candidates.noPass!,
      candidates.hang!,
    ];
    const savedTimeout = process.env.DEJABUG_TEST_TIMEOUT_SEC;
    process.env.DEJABUG_TEST_TIMEOUT_SEC = "3";
    const main = await certify(list, repo.dir, emitter, 2).finally(() => {
      if (savedTimeout === undefined) delete process.env.DEJABUG_TEST_TIMEOUT_SEC;
      else process.env.DEJABUG_TEST_TIMEOUT_SEC = savedTimeout;
    });
    const missing = await certify([candidates.missingTest!], repo.dir, new EventEmitter(), 1);
    results = new Map([
      ["certified", main[0]!],
      ["build", main[1]!],
      ["noFail", main[2]!],
      ["noPass", main[3]!],
      ["hang", main[4]!],
      ["missing", missing[0]!],
    ]);
  }, 180_000);

  afterAll(() => rmSync(repo.dir, { recursive: true, force: true }));

  it("certifies a real fail-then-pass fix with recorded output", () => {
    const r = results.get("certified")!;
    expect(r.status).toBe("certified");
    expect(r.failRuns).toBe(3);
    expect(r.passRuns).toBe(1);
    expect(r.failOutput).toContain("--- FAIL: TestAdd");
    expect(r.passOutput).toMatch(/^ok\s/m);
  });

  it("rejects a test that does not compile before the fix, recording the compiler output", () => {
    const r = results.get("build")!;
    expect(r.status).toBe("rejected:build");
    expect(r.failOutput).toMatch(/undefined: Sub|build failed/);
  });

  it("certifies a deadlock fix: three hangs before, a pass after", () => {
    const r = results.get("hang")!;
    expect(r.status).toBe("certified");
    expect(r.failRuns).toBe(3);
    expect(r.failOutput).toMatch(/test timed out|TestWait/);
  });

  it("never records local worktree paths", () => {
    for (const r of results.values()) {
      expect(r.failOutput + r.passOutput).not.toMatch(/dejabug-wt-|AppData/);
    }
  });

  it("rejects a test that already passes before the fix", () => {
    expect(results.get("noFail")!.status).toBe("rejected:no-fail");
  });

  it("rejects a fix that does not make its test pass", () => {
    expect(results.get("noPass")!.status).toBe("rejected:no-pass");
  });

  it("never certifies when the tests do not exist", () => {
    expect(results.get("missing")!.status).not.toBe("certified");
  });

  it("emits one result event per candidate with worker slots below the concurrency", () => {
    const resultEvents = events.filter((e) => e.type === "result");
    expect(resultEvents).toHaveLength(5);
    for (const e of events) if ("worker" in e) expect(e.worker).toBeLessThan(2);
  });

  it("aborts the whole run when the toolchain is missing", async () => {
    // A fake language whose toolchain is never installed. Deterministic on every OS and CI image.
    const missing: LanguageAdapter = {
      ...goAdapter,
      id: "missing-toolchain",
      runTests: () => Promise.reject(new ToolMissingError("missing-tool")),
    };
    ADAPTERS.push(missing);
    try {
      const doomed = { ...candidates.certified!, language: missing.id };
      await expect(certify([doomed], repo.dir, new EventEmitter(), 1)).rejects.toBeInstanceOf(
        ToolMissingError,
      );
    } finally {
      ADAPTERS.splice(ADAPTERS.indexOf(missing), 1);
    }
  });

  it("cleans up its worktrees", () => {
    const list = repo.git("worktree", "list").trim().split("\n");
    expect(list).toHaveLength(1);
  });
});
