#!/usr/bin/env node
import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { Command } from "commander";
import { certify } from "./certifier.js";
import { loadConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { mine } from "./miner.js";
import {
  computeFunnel,
  mergeCertifications,
  readCandidates,
  readCertifications,
  writeFunnel,
} from "./store.js";
import type { CandidatesFile, ForgeEvent } from "./types.js";

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
  .command("certify")
  .description("prove each candidate's test fails before the fix and passes after it")
  .option("--limit <n>", "certify at most N candidates (newest first)", (v) => Number(v))
  .option("--concurrency <n>", "parallel worktrees", (v) => Number(v), 4)
  .option("--only <shas>", "comma-separated fix shas (prefixes allowed) to certify")
  .option("--redo", "re-certify candidates that already have a result")
  .action(async (opts: { limit?: number; concurrency: number; only?: string; redo?: boolean }) => {
    const config = loadConfig();
    const file = readCandidates(config.casesDir);
    if (!file) throw new Error(`no candidates.json in ${config.casesDir}; run "dejabug mine" first`);

    const done = new Set((readCertifications(config.casesDir)?.results ?? []).map((r) => r.fixSha));
    const only = opts.only?.split(",").map((s) => s.trim().toLowerCase());
    let queue = file.candidates.filter((c) =>
      only ? only.some((p) => c.fixSha.startsWith(p)) : opts.redo || !done.has(c.fixSha),
    );
    if (opts.limit) queue = queue.slice(0, opts.limit);
    if (queue.length === 0) {
      console.log("nothing to certify (use --redo to re-run finished candidates)");
      return;
    }

    console.log(`certifying ${queue.length} candidates with ${opts.concurrency} workers...`);
    const emitter = new EventEmitter();
    emitter.on("forge", (e: ForgeEvent) => {
      if (e.type === "result") console.log(`  [w${e.worker}] ${e.fixSha.slice(0, 7)}  ${e.status}`);
    });

    const started = Date.now();
    const results = await certify(queue, config.repoDir, emitter, opts.concurrency);
    const merged = mergeCertifications(config.casesDir, file.repo, results);
    const funnel = computeFunnel(file, merged.results);
    writeFunnel(config.casesDir, funnel);

    const secs = ((Date.now() - started) / 1000).toFixed(0);
    console.log(
      `\ndone in ${secs}s. This run: ${results.filter((r) => r.status === "certified").length}/` +
        `${results.length} certified. Overall: ${funnel.byStatus.certified} certified of ` +
        `${funnel.attempted} attempted (${funnel.candidates} candidates, ${funnel.fixLikeCommits} fix-like).`,
    );
    console.log(
      "by status:",
      Object.entries(funnel.byStatus)
        .map(([k, v]) => `${k}=${v}`)
        .join(" "),
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
