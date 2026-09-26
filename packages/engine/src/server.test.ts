import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixtureRepo, goFile, goTest } from "../test/fixture-repo.js";
import { loadConfig, type Config } from "./config.js";
import { extractMode } from "./play.js";
import { buildServer, isLocalRequest, toPublicCase } from "./server.js";
import { writeCase } from "./store.js";
import type { Case } from "./types.js";

function hasGo(): boolean {
  try {
    execFileSync("go", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const BUGGY = "func Add(a, b int) int { return a - b }\n";
const FIXED = "func Add(a, b int) int { return a + b }\n";

function makeCase(repo: FixtureRepo, parent: string, fix: string): Case {
  return {
    id: fix.slice(0, 7),
    repo: "demo/calc",
    language: "go",
    fixSha: fix,
    parentSha: parent,
    status: "certified",
    tests: ["TestAdd"],
    packages: ["."],
    testFiles: ["calc_test.go"],
    certification: {
      failRuns: 3,
      passRuns: 1,
      failOutput: "--- FAIL: TestAdd",
      passOutput: "ok",
      durationMs: 1,
    },
    brief: {
      codename: "Minus Sign Heist",
      symptoms: "Totals come out smaller than expected.",
      evidence: "--- FAIL: TestAdd",
      hints: ["Check the arithmetic.", "Look at the operator.", "Addition is not subtraction."],
      difficulty: 1,
      precinct: "math",
      lesson: "Operators matter.",
      tags: ["arith"],
    },
    original: { mergedAt: "2026-01-01T00:00:00Z", daysOpen: 2, comments: 4, reviewRounds: 1 },
    bugAgeDays: 10,
    parSeconds: 600,
    fixDiff: repo.git("diff", parent, fix, "--", "calc.go"),
  };
}

describe("toPublicCase and extractMode", () => {
  it("withholds the fix, the lesson and the hints", () => {
    const pub = toPublicCase({
      fixDiff: "secret",
      brief: { hints: ["a", "b", "c"], lesson: "l", codename: "X" },
    } as unknown as Case);
    expect(JSON.stringify(pub)).not.toMatch(/secret|"lesson"|"hints"/);
    expect(pub.hintCount).toBe(3);
  });

  it("extracts a single mode block from custom_modes.yaml", () => {
    const yaml =
      "customModes:\n  - slug: a\n    name: A\n  - slug: deja-mentor\n    name: Mentor\n    groups:\n      - read\n";
    expect(extractMode(yaml, "deja-mentor")).toBe(
      "customModes:\n  - slug: deja-mentor\n    name: Mentor\n    groups:\n      - read\n",
    );
    expect(extractMode(yaml, "missing")).toBeUndefined();
  });
});

describe("engine request guard (REVIEW-03)", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dejabug-guard-"));
  writeFileSync(path.join(root, "PROJECT.md"), "# fixture\n");
  const cfg = loadConfig({ DEJABUG_REPO_SLUG: "demo/calc" }, root);
  const app = buildServer(cfg, {
    runForge: async (_c, _o, emitter) => void emitter.emit("forge", { type: "done" }),
  });
  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("accepts this machine and rejects other hosts and origins", () => {
    expect(isLocalRequest("GET", "localhost:4317")).toBe(true);
    expect(isLocalRequest("POST", "127.0.0.1:4317", "http://localhost:5173")).toBe(true);
    expect(isLocalRequest("GET", "evil.example:4317")).toBe(false);
    expect(isLocalRequest("POST", "localhost:4317", "https://evil.example")).toBe(false);
    expect(isLocalRequest("POST", "localhost:4317", "null")).toBe(false);
  });

  it("refuses cross-site and text/plain requests", async () => {
    const crossSite = await app.inject({
      method: "POST",
      url: "/api/forge",
      headers: { origin: "https://evil.example" },
      payload: {},
    });
    expect(crossSite.statusCode).toBe(403);
    const rebinding = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "evil.example" },
    });
    expect(rebinding.statusCode).toBe(403);
    const textPlain = await app.inject({
      method: "PUT",
      url: "/api/profile",
      headers: { "content-type": "text/plain" },
      payload: "{}",
    });
    expect(textPlain.statusCode).toBe(415);
    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
  });

  it("rejects repository names that climb out of cases/", async () => {
    expect((await app.inject({ method: "GET", url: "/api/cases?repo=.." })).statusCode).toBe(400);
  });

  it("starts with empty sessions when state.json is corrupt", async () => {
    mkdirSync(path.join(root, ".dejabug"), { recursive: true });
    writeFileSync(path.join(root, ".dejabug", "state.json"), "{not json");
    const fresh = buildServer(cfg);
    expect((await fresh.inject({ method: "GET", url: "/api/profile" })).json()).toBeNull();
    await fresh.close();
  });
});

describe.skipIf(!hasGo())("game server (Go fixture repository)", () => {
  const repo = new FixtureRepo();
  const root = mkdtempSync(path.join(os.tmpdir(), "dejabug-server-"));
  let cfg: Config;
  let c: Case;
  let app: ReturnType<typeof buildServer>;

  beforeAll(async () => {
    const parent = repo.commit("initial", {
      "go.mod": "module calc\n\ngo 1.22\n",
      "calc.go": goFile("calc", BUGGY),
      "calc_test.go": goFile("calc", 'import "testing"\n\n' + goTest("TestSmoke")),
    });
    const fix = repo.commit("fix: Add subtracts", {
      "calc.go": goFile("calc", FIXED),
      "calc_test.go": goFile(
        "calc",
        'import "testing"\n\n' + goTest("TestAdd", "\tif Add(2, 3) != 5 {\n\t\tt.Fatal(Add(2, 3))\n\t}"),
      ),
    });
    writeFileSync(path.join(root, "PROJECT.md"), "# fixture\n");
    cfg = loadConfig({ DEJABUG_REPO_DIR: repo.dir, DEJABUG_REPO_SLUG: "demo/calc" }, root);
    c = makeCase(repo, parent, fix);
    mkdirSync(cfg.casesDir, { recursive: true });
    writeCase(cfg.casesDir, c);
    app = buildServer(cfg);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    rmSync(repo.dir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });

  it("lists public cases without spoilers", async () => {
    const res = await app.inject({ method: "GET", url: "/api/cases" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.body).not.toContain("Addition is not subtraction");
    expect(res.body).not.toContain(c.fixDiff.slice(0, 40));
  });

  it("requires taking the case before hints, verify, or reveal", async () => {
    expect((await app.inject({ method: "POST", url: `/api/cases/${c.id}/hint/1` })).statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: `/api/cases/${c.id}/reveal` })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/cases/zzzzzzz" })).statusCode).toBe(404);
  });

  it("plays a full case: start, ordered hints, fail, fix, pass, reveal", async () => {
    const start = await app.inject({ method: "POST", url: `/api/cases/${c.id}/start` });
    expect(start.statusCode).toBe(200);
    const pg = start.json().path as string;
    expect(
      execFileSync("git", ["log", "--oneline"], { cwd: pg, encoding: "utf8" }).trim().split("\n"),
    ).toHaveLength(1);

    expect((await app.inject({ method: "POST", url: `/api/cases/${c.id}/hint/2` })).statusCode).toBe(409);
    const hint = await app.inject({ method: "POST", url: `/api/cases/${c.id}/hint/1` });
    expect(hint.json()).toMatchObject({ n: 1, hint: "Check the arithmetic." });

    const fail = await app.inject({ method: "POST", url: `/api/cases/${c.id}/verify` });
    expect(fail.json().result).toMatchObject({ pass: false, outcome: "fail", failingTests: ["TestAdd"] });
    expect((await app.inject({ method: "GET", url: `/api/cases/${c.id}/reveal` })).statusCode).toBe(403);

    writeFileSync(path.join(pg, "calc.go"), goFile("calc", FIXED));
    const pass = await app.inject({ method: "POST", url: `/api/cases/${c.id}/verify` });
    expect(pass.json().result.pass).toBe(true);
    expect(pass.json().session.solvedAt).toBeTruthy();

    const reveal = await app.inject({ method: "GET", url: `/api/cases/${c.id}/reveal` });
    expect(reveal.statusCode).toBe(200);
    const body = reveal.json().reveal;
    expect(body.lesson).toBe("Operators matter.");
    expect(body.playerDiff).toContain("+func Add(a, b int) int { return a + b }");
    expect(body.playerDiff).not.toContain("calc_test.go");
  }, 120_000);

  it("persists sessions across server restarts", async () => {
    const again = buildServer(cfg);
    const res = await again.inject({ method: "GET", url: `/api/cases/${c.id}/session` });
    expect(res.json().session.solvedAt).toBeTruthy();
    expect(res.json().hints).toEqual(["Check the arithmetic."]);
    await again.close();
  });

  it("runs one forge at a time and reports its status", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((r) => (finish = r));
    const forgeApp = buildServer(cfg, {
      runForge: async (_cfg, _opts, emitter) => {
        emitter.emit("forge", { type: "log", message: "working" });
        await gate;
        emitter.emit("forge", { type: "done" });
      },
    });
    expect(
      (await forgeApp.inject({ method: "POST", url: "/api/forge", payload: { limit: 2 } })).statusCode,
    ).toBe(202);
    expect((await forgeApp.inject({ method: "POST", url: "/api/forge", payload: {} })).statusCode).toBe(409);
    finish();
    await new Promise((r) => setTimeout(r, 20));
    const status = await forgeApp.inject({ method: "GET", url: "/api/forge/status" });
    expect(status.json()).toMatchObject({ running: false, events: 2 });
    await forgeApp.close();
  });
});
