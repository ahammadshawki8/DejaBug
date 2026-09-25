import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectAdapter, getAdapter } from "./index.js";
import { classifyPytest, isPySourceFile, isPyTestFile, pythonAdapter, pyTestsTouched } from "./python.js";

describe("python adapter: files and diffs", () => {
  it("classifies pytest files and sources", () => {
    expect(isPyTestFile("tests/test_auth.py")).toBe(true);
    expect(isPyTestFile("pkg/auth_test.py")).toBe(true);
    expect(isPyTestFile("pkg/auth.py")).toBe(false);
    expect(isPySourceFile("ibm_cloud_sdk_core/authenticators/iam.py")).toBe(true);
    expect(isPySourceFile("tests/conftest.py")).toBe(false);
    expect(isPySourceFile("test/utils.py")).toBe(false);
    expect(isPySourceFile("setup.py")).toBe(false);
    expect(isPySourceFile("docs/conf.py")).toBe(false);
  });

  it("finds added tests, edited tests, and test classes", () => {
    const diff = [
      "diff --git a/tests/test_a.py b/tests/test_a.py",
      "@@ -10,0 +11,2 @@ def test_existing():",
      "+    assert x",
      "@@ -20,0 +23,4 @@ def test_previous():",
      "+",
      "+def test_added(tmp_path):",
      "+    assert True",
      "@@ -40,0 +47,3 @@ class TestSuite:",
      "+    async def test_method(self):",
    ].join("\n");
    expect(pyTestsTouched(diff)).toEqual(["test_added", "test_existing", "test_method"]);
  });

  it("maps pytest exit codes to outcomes", () => {
    const failed =
      "FAILED tests/test_a.py::test_x - AssertionError\nFAILED tests/test_a.py::TestS::test_y[1] - E";
    expect(classifyPytest(1, failed)).toMatchObject({
      outcome: "fail",
      failingTests: ["test_x", "test_y"],
    });
    expect(classifyPytest(0, "3 passed").outcome).toBe("pass");
    expect(classifyPytest(5, "no tests ran").outcome).toBe("notest");
    expect(classifyPytest(2, "ImportError while importing test module").outcome).toBe("build");
  });

  it("is registered and detected from project files", () => {
    expect(getAdapter("python")).toBe(pythonAdapter);
  });
});

function hasPytest(): boolean {
  try {
    execFileSync(process.env.DEJABUG_PYTHON || "python", ["-m", "pytest", "--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasPytest())("python adapter: runTests on a real project", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dejabug-py-"));

  beforeAll(() => {
    writeFileSync(path.join(dir, "pyproject.toml"), '[project]\nname = "calc"\nversion = "0.0.1"\n');
    mkdirSync(path.join(dir, "calc"));
    writeFileSync(path.join(dir, "calc", "__init__.py"), "def add(a, b):\n    return a - b\n");
    mkdirSync(path.join(dir, "tests"));
    writeFileSync(
      path.join(dir, "tests", "test_calc.py"),
      [
        "import time",
        "from calc import add",
        "",
        "def test_pass():",
        "    assert True",
        "",
        "def test_add():",
        "    assert add(2, 3) == 5",
        "",
        "def test_hang():",
        "    time.sleep(60)",
        "",
      ].join("\n"),
    );
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("detects the project", () => {
    expect(detectAdapter(dir)).toBe(pythonAdapter);
  });

  it("passes, fails with names, finds no tests, and detects hangs", async () => {
    const t = ["tests/test_calc.py"];
    expect((await pythonAdapter.runTests(dir, t, ["test_pass"])).outcome).toBe("pass");
    const fail = await pythonAdapter.runTests(dir, t, ["test_add"]);
    expect(fail).toMatchObject({ outcome: "fail", failingTests: ["test_add"] });
    expect((await pythonAdapter.runTests(dir, t, ["test_nope"])).outcome).toBe("notest");
    expect((await pythonAdapter.runTests(dir, t, ["test_hang"], { testTimeoutSec: 3 })).outcome).toBe("hang");
  }, 60_000);

  it("tests the checked-out code, not an installed copy", async () => {
    writeFileSync(path.join(dir, "calc", "__init__.py"), "def add(a, b):\n    return a + b\n");
    expect((await pythonAdapter.runTests(dir, ["tests/test_calc.py"], ["test_add"])).outcome).toBe("pass");
  }, 30_000);
});
