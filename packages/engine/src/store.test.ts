import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { computeFunnel, mergeCertifications, readCase, stripLocalPaths } from "./store.js";
import type { CandidatesFile, Certification } from "./types.js";

const dir = mkdtempSync(path.join(os.tmpdir(), "dejabug-store-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function cert(fixSha: string, status: Certification["status"], failOutput = ""): Certification {
  return { fixSha, status, failRuns: 3, passRuns: 1, failOutput, passOutput: "", durationMs: 1 };
}

describe("stripLocalPaths", () => {
  it("removes Windows and POSIX worktree prefixes, keeping the relative file", () => {
    const win =
      "Error Trace:\tC:/Users/someone/AppData/Local/Temp/dejabug-wt-4d07ef2ec3/api_versions_test.go:72";
    const back = "at C:\\Users\\someone\\AppData\\Local\\Temp\\dejabug-wt-abc123\\client.go:10";
    const posix = "/tmp/dejabug-wt-00ff/broker_test.go:5: boom";
    expect(stripLocalPaths(win)).toBe("Error Trace:\tapi_versions_test.go:72");
    expect(stripLocalPaths(back)).toBe("at client.go:10");
    expect(stripLocalPaths(posix)).toBe("broker_test.go:5: boom");
    expect(stripLocalPaths("--- FAIL: TestX (0.00s)")).toBe("--- FAIL: TestX (0.00s)");
  });
});

describe("mergeCertifications and computeFunnel", () => {
  it("merges by sha, newer wins, and sanitizes before writing", () => {
    mergeCertifications(dir, "o/r", [cert("aaa", "rejected:timeout"), cert("bbb", "certified")]);
    const merged = mergeCertifications(dir, "o/r", [
      cert("aaa", "certified", "C:/Users/x/AppData/Local/Temp/dejabug-wt-aaa/a_test.go:1: fail"),
    ]);
    expect(merged.results.map((r) => [r.fixSha, r.status])).toEqual([
      ["aaa", "certified"],
      ["bbb", "certified"],
    ]);
    const onDisk = readFileSync(path.join(dir, "certifications.json"), "utf8");
    expect(onDisk).not.toMatch(/AppData|dejabug-wt-/);
    expect(onDisk).toContain("a_test.go:1: fail");
  });

  it("counts every status", () => {
    const candidates: CandidatesFile = {
      repo: "o/r",
      language: "go",
      generatedAt: "",
      scannedCommits: 10,
      fixLikeCommits: 5,
      candidates: [],
    };
    const f = computeFunnel(candidates, [cert("a", "certified"), cert("b", "rejected:build")]);
    expect(f).toMatchObject({ fixLikeCommits: 5, attempted: 2 });
    expect(f.byStatus).toMatchObject({ certified: 1, "rejected:build": 1, "rejected:flaky": 0 });
  });
});

describe("readCase", () => {
  it("rejects ids that are not short shas", () => {
    expect(readCase(dir, "../../etc/passwd")).toBeUndefined();
    expect(readCase(dir, "abc1234")).toBeUndefined();
  });
});
