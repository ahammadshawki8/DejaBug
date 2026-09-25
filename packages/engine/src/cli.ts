#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { mine } from "./miner.js";
import type { CandidatesFile } from "./types.js";

/** Resolves CLI paths against the directory the user ran the command from (npm sets INIT_CWD). */
function fromInvocationDir(p: string): string {
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), p);
}

const program = new Command();

program
  .name("dejabug")
  .description("Mine, certify, and brief real bug fixes into training cases.")
  .version("0.1.0");

program
  .command("doctor")
  .description("check git, go, the target repo, Bob Shell, and watsonx configuration")
  .action(() => {
    const checks = runDoctor(loadConfig());
    for (const c of checks) console.log(`${c.ok ? "OK  " : "MISS"}  ${c.name.padEnd(12)} ${c.detail}`);
  });

program
  .command("mine")
  .description("find fix-like commits that change tests plus 1-3 source files")
  .option("--repo <dir>", "target repository (default: DEJABUG_REPO_DIR)")
  .option("--out <file>", "output JSON (default: <casesDir>/candidates.json)")
  .option("--max-commits <n>", "only scan the most recent N commits", (v) => Number(v))
  .action(async (opts: { repo?: string; out?: string; maxCommits?: number }) => {
    const config = loadConfig();
    const repoDir = opts.repo ? fromInvocationDir(opts.repo) : config.repoDir;
    const out = opts.out ? fromInvocationDir(opts.out) : path.join(config.casesDir, "candidates.json");

    const started = Date.now();
    const result = await mine(repoDir, { maxCommits: opts.maxCommits });
    const file: CandidatesFile = {
      repo: config.repoSlug,
      generatedAt: new Date().toISOString(),
      ...result,
    };
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(file, null, 2) + "\n");

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `scanned ${result.scannedCommits} commits, ${result.fixLikeCommits} fix-like, ` +
        `${result.candidates.length} candidates in ${secs}s -> ${path.relative(process.cwd(), out)}`,
    );
  });

program
  .command("serve")
  .description("start the local engine server (full API arrives in T4.3)")
  .action(() => {
    const config = loadConfig();
    const server = createServer((req, res) => {
      if (req.url === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, repo: config.repoSlug }));
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(config.port, () =>
      console.log(`dejabug engine listening on http://localhost:${config.port}`),
    );
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
