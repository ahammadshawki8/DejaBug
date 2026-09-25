import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ToolMissingError } from "./errors.js";
import {
  classifyGoOutput,
  combineResults,
  goAdapter,
  goTestsTouched,
  groupByModule,
  hasBuildConstraint,
  packageOf,
} from "./go.js";
import { detectAdapter, getAdapter } from "./index.js";

describe("go adapter: files and diffs", () => {
  it("classifies files", () => {
    expect(goAdapter.isTestFile("client_test.go")).toBe(true);
    expect(goAdapter.isSourceFile("client.go")).toBe(true);
    expect(goAdapter.isSourceFile("client_test.go")).toBe(false);
    expect(goAdapter.isSourceFile("vendor/x/y.go")).toBe(false);
  });

  it("maps files to go test package args", () => {
    expect(packageOf("client_test.go")).toBe(".");
    expect(packageOf("mocks/consumer_test.go")).toBe("./mocks");
    expect(goAdapter.testTargets(["a_test.go", "mocks/b_test.go", "c_test.go"])).toEqual([".", "./mocks"]);
  });

  it("finds added tests and tests changed inside existing functions, ignoring append headers", () => {
    const diff = [
      "diff --git a/x_test.go b/x_test.go",
      "@@ -10,0 +11,3 @@ func TestExisting(t *testing.T) {",
      "+\tassert(t, x)",
      "@@ -40,0 +44,4 @@ func TestPrevious(t *testing.T) {",
      "+",
      "+func TestAdded(t *testing.T) {",
      "+}",
    ].join("\n");
    expect(goTestsTouched(diff)).toEqual(["TestAdded", "TestExisting"]);
  });

  it("treats build-tagged files as not runnable", () => {
    expect(hasBuildConstraint("//go:build functional\n\npackage sarama")).toBe(true);
    expect(hasBuildConstraint("// +build functional\n\npackage sarama")).toBe(true);
    expect(goAdapter.isRunnableTestFile("package sarama\n")).toBe(true);
  });
});

describe("go adapter: output classification", () => {
  it("pass and notest on exit 0", () => {
    expect(classifyGoOutput(true, "ok  \tdemo\t0.1s").outcome).toBe("pass");
    expect(classifyGoOutput(true, "ok  \tdemo\t0.1s [no tests to run]").outcome).toBe("notest");
  });

  it("fail with the failing top-level test names", () => {
    const out = "--- FAIL: TestA (0.00s)\n    --- FAIL: TestA/sub (0.00s)\nFAIL\nFAIL\tdemo\t0.2s";
    const r = classifyGoOutput(false, out);
    expect(r.outcome).toBe("fail");
    expect(r.failingTests).toEqual(["TestA"]);
  });

  it("build when compilation fails (FAIL line without --- FAIL)", () => {
    const out = "# demo [demo.test]\n./a_test.go:5:34: undefined: X\nFAIL\tdemo [build failed]\nFAIL";
    expect(classifyGoOutput(false, out).outcome).toBe("build");
  });

  it("hang when go's own per-test timeout fires", () => {
    const out =
      "panic: test timed out after 45s\n\trunning tests:\n\t\tTestDeadlock (45s)\n\ngoroutine 1 [chan receive]:";
    expect(classifyGoOutput(false, out).outcome).toBe("hang");
  });
});

describe("go adapter: multi-module repositories", () => {
  it("routes each package to its nearest go.mod", () => {
    const modules = new Set(["v2", "gen/v2"]);
    const groups = groupByModule([".", "./option", "./v2/array", "./v2", "./gen/v2/mcp"], (d) =>
      modules.has(d),
    );
    expect(Object.fromEntries(groups)).toEqual({
      ".": [".", "./option"],
      v2: ["./array", "."],
      "gen/v2": ["./mcp"],
    });
  });

  it("combines per-module outcomes with failures dominating", () => {
    const r = (outcome: "pass" | "fail" | "notest" | "build") => ({
      outcome,
      output: outcome,
      failingTests: [],
    });
    expect(combineResults([r("pass"), r("notest")]).outcome).toBe("pass");
    expect(combineResults([r("pass"), r("fail")]).outcome).toBe("fail");
    expect(combineResults([r("fail"), r("build")]).outcome).toBe("build");
    expect(combineResults([r("notest"), r("notest")]).outcome).toBe("notest");
  });
});

describe("adapter registry", () => {
  it("looks adapters up by id and rejects unknown ids", () => {
    expect(getAdapter("go")).toBe(goAdapter);
    expect(() => getAdapter("cobol")).toThrow(/no language adapter/);
  });
});

function hasGo(): boolean {
  try {
    execFileSync("go", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasGo())("go adapter: runTests on a real module", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dejabug-go-"));

  beforeAll(() => {
    writeFileSync(path.join(dir, "go.mod"), "module demo\n\ngo 1.22\n");
    writeFileSync(path.join(dir, "demo.go"), "package demo\n\nfunc Answer() int { return 41 }\n");
    writeFileSync(
      path.join(dir, "demo_test.go"),
      [
        "package demo",
        "",
        'import "testing"',
        "",
        "func TestPass(t *testing.T) {}",
        "func TestFail(t *testing.T) { if Answer() != 42 { t.Fatal(Answer()) } }",
        "func TestHang(t *testing.T) { select {} }",
        "func TestPassToo(t *testing.T) {}",
        "",
      ].join("\n"),
    );
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("detects the module", () => {
    expect(detectAdapter(dir)).toBe(goAdapter);
  });

  it("runs only the exact tests requested", async () => {
    const r = await goAdapter.runTests(dir, ["."], ["TestPass"]);
    expect(r.outcome).toBe("pass");
  });

  it("reports failures, missing tests, and hangs", async () => {
    expect((await goAdapter.runTests(dir, ["."], ["TestFail"])).outcome).toBe("fail");
    expect((await goAdapter.runTests(dir, ["."], ["TestNope"])).outcome).toBe("notest");
    const hang = await goAdapter.runTests(dir, ["."], ["TestHang"], { testTimeoutSec: 2 });
    expect(hang.outcome).toBe("hang");
  }, 60_000);

  it("throws ToolMissingError when go is not on PATH", async () => {
    const saved = process.env.PATH;
    process.env.PATH = "";
    try {
      await expect(goAdapter.runTests(dir, ["."], ["TestPass"])).rejects.toBeInstanceOf(ToolMissingError);
    } finally {
      process.env.PATH = saved;
    }
  });
});
