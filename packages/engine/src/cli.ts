#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { Command } from "commander";
import { ADAPTERS, detectAdapter } from "./adapters/index.js";
import { certify } from "./certifier.js";
import { findRepoRoot, loadConfig, normalizeSlug, type Config } from "./config.js";
import { runDoctor } from "./doctor.js";
import { WatsonxClient } from "./llm/watsonx.js";
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
  .description("Turn any repository's real bug fixes into certified training cases.")
  .version("0.1.0")
  .option(
    "-t, --target <repo>",
    "target repository as owner/name or GitHub URL (default: DEJABUG_REPO_SLUG)",
  );

function config(): Config {
  const target = program.opts<{ target?: string }>().target;
  return loadConfig(process.env, findRepoRoot(), { target });
}

/** The target repo's language adapter, with its toolchain verified. Throws with a fix-it message otherwise. */
function requireAdapter(cfg: Config) {
  if (!existsSync(path.join(cfg.repoDir, ".git"))) {
    throw new Error(`${cfg.repoSlug} is not cloned yet. Run: dejabug init ${cfg.repoSlug}`);
  }
  const adapter = detectAdapter(cfg.repoDir);
  if (!adapter) {
    throw new Error(
      `no supported language in ${cfg.repoSlug} (adapters: ${ADAPTERS.map((a) => a.name).join(", ")})`,
    );
  }
  const tool = adapter.toolCheck();
  if (!tool.ok) {
    throw new Error(
      `${adapter.name} toolchain unavailable in this terminal (${tool.detail}). Every run would be misread, ` +
        "so nothing was started. Open a new terminal after installing it and run `dejabug doctor`.",
    );
  }
  return adapter;
}

program
  .command("doctor")
  .description("check git, the target repo, its language toolchain, Bob Shell, and watsonx configuration")
  .action(() => {
    for (const c of runDoctor(config()))
      console.log(`${c.ok ? "OK  " : "MISS"}  ${c.name.padEnd(12)} ${c.detail}`);
  });

program
  .command("init")
  .description("clone a GitHub repository into workspace/ and detect its language")
  .argument("<repo>", "owner/name or GitHub URL")
  .action((repo: string) => {
    const slug = normalizeSlug(repo);
    const cfg = loadConfig(process.env, findRepoRoot(), { target: slug });
    if (existsSync(path.join(cfg.repoDir, ".git"))) {
      console.log(`${slug} already cloned at ${cfg.repoDir}`);
    } else {
      console.log(`cloning https://github.com/${slug}.git ...`);
      mkdirSync(path.dirname(cfg.repoDir), { recursive: true });
      execFileSync("git", ["clone", "--quiet", `https://github.com/${slug}.git`, cfg.repoDir], {
        stdio: "inherit",
      });
    }
    const adapter = detectAdapter(cfg.repoDir);
    if (!adapter) {
      console.log(`no supported language detected (adapters: ${ADAPTERS.map((a) => a.name).join(", ")})`);
      process.exitCode = 1;
      return;
    }
    const tool = adapter.toolCheck();
    console.log(
      `language: ${adapter.name}   toolchain: ${tool.ok ? tool.detail : `MISSING (${tool.detail})`}`,
    );
    console.log(`next: dejabug --target ${slug} mine`);
  });

program
  .command("mine")
  .description("find fix-like commits that change tests plus 1-3 source files")
  .option("--repo <dir>", "repository directory (default: the --target clone)")
  .option("--out <file>", "output JSON (default: <casesDir>/candidates.json)")
  .option("--max-commits <n>", "only scan the most recent N commits", (v) => Number(v))
  .action(async (opts: { repo?: string; out?: string; maxCommits?: number }) => {
    const cfg = config();
    const repoDir = opts.repo ? fromInvocationDir(opts.repo) : cfg.repoDir;
    const out = opts.out ? fromInvocationDir(opts.out) : path.join(cfg.casesDir, "candidates.json");

    const started = Date.now();
    const result = await mine(repoDir, { maxCommits: opts.maxCommits });
    const file: CandidatesFile = { repo: cfg.repoSlug, generatedAt: new Date().toISOString(), ...result };
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(file, null, 2) + "\n");

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[${result.language}] scanned ${result.scannedCommits} commits, ${result.fixLikeCommits} fix-like, ` +
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
    const cfg = config();
    const file = readCandidates(cfg.casesDir);
    if (!file) throw new Error(`no candidates.json in ${cfg.casesDir}; run "dejabug mine" first`);
    const adapter = requireAdapter(cfg);

    const done = new Set((readCertifications(cfg.casesDir)?.results ?? []).map((r) => r.fixSha));
    const only = opts.only?.split(",").map((s) => s.trim().toLowerCase());
    let queue = file.candidates.filter((c) =>
      only ? only.some((p) => c.fixSha.startsWith(p)) : opts.redo || !done.has(c.fixSha),
    );
    if (opts.limit) queue = queue.slice(0, opts.limit);
    if (queue.length === 0) {
      console.log("nothing to certify (use --redo to re-run finished candidates)");
      return;
    }

    console.log(`[${adapter.id}] certifying ${queue.length} candidates with ${opts.concurrency} workers...`);
    const emitter = new EventEmitter();
    emitter.on("forge", (e: ForgeEvent) => {
      if (e.type === "result") console.log(`  [w${e.worker}] ${e.fixSha.slice(0, 7)}  ${e.status}`);
    });

    const started = Date.now();
    const results = await certify(queue, cfg.repoDir, emitter, opts.concurrency);
    const merged = mergeCertifications(cfg.casesDir, file.repo, results);
    const funnel = computeFunnel(file, merged.results);
    writeFunnel(cfg.casesDir, funnel);

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
  .command("models")
  .description("list the watsonx.ai chat models available to this account (banned models are hidden)")
  .action(async () => {
    const client = WatsonxClient.fromConfig(config());
    const models = await client.listChatModels();
    for (const m of models) console.log(`${m.modelId.padEnd(48)} ${m.provider}`);
    const granite = models.filter((m) => m.modelId.includes("granite") && !m.modelId.includes("guardian"));
    if (granite.length) console.log(`\nsuggested for WATSONX_MODEL_ID: ${granite.at(-1)!.modelId}`);
  });

program
  .command("serve")
  .description("start the local engine server (full API arrives in T4.3)")
  .action(() => {
    const cfg = config();
    const server = createServer((req, res) => {
      if (req.url === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, repo: cfg.repoSlug }));
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(cfg.port, () => console.log(`dejabug engine listening on http://localhost:${cfg.port}`));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
