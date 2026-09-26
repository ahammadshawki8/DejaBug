#!/usr/bin/env node
import { EventEmitter } from "node:events";
import path from "node:path";
import { Command } from "commander";
import { ADAPTERS } from "./adapters/index.js";
import { findRepoRoot, loadConfig, normalizeSlug, type Config, type LlmProvider } from "./config.js";
import { runDoctor } from "./doctor.js";
import { initRepo, renameDuplicateCodenames, runBrief, runCertify, runMine } from "./forge.js";
import { WatsonxClient } from "./llm/watsonx.js";
import { exportPlayground } from "./play.js";
import { readCase } from "./store.js";
import { startServer } from "./server.js";
import type { ForgeEvent } from "./types.js";

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

/** Prints forge progress events in a compact, log-friendly form. */
function consoleReporter(): EventEmitter {
  const emitter = new EventEmitter();
  emitter.on("forge", (e: ForgeEvent) => {
    if (e.type === "result") console.log(`  [w${e.worker}] ${e.fixSha.slice(0, 7)}  ${e.status}`);
    if (e.type === "briefed") {
      console.log(`  [w${e.worker}] ${e.fixSha.slice(0, 7)}  ${e.ok ? `"${e.codename}"` : "brief FAILED"}`);
    }
    if (e.type === "log") console.log(`  ${e.message}`);
  });
  return emitter;
}

const splitList = (v?: string) => v?.split(",").map((s) => s.trim());

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
    console.log(`preparing ${slug} in ${cfg.repoDir} ...`);
    const adapter = initRepo(cfg);
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
  .option("--out <file>", "output JSON (default: <casesDir>/candidates.json)")
  .option("--max-commits <n>", "only scan the most recent N commits", (v) => Number(v))
  .action(async (opts: { out?: string; maxCommits?: number }) => {
    const started = Date.now();
    const file = await runMine(config(), opts.out ? fromInvocationDir(opts.out) : undefined, opts.maxCommits);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[${file.language}] scanned ${file.scannedCommits} commits, ${file.fixLikeCommits} fix-like, ` +
        `${file.candidates.length} candidates in ${secs}s`,
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
    const started = Date.now();
    const { results, funnel } = await runCertify(
      config(),
      { ...opts, only: splitList(opts.only) },
      consoleReporter(),
    );
    if (results.length === 0) {
      console.log("nothing to certify (use --redo to re-run finished candidates)");
      return;
    }
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
  .command("brief")
  .description("write spoiler-free case files for certified candidates (GitHub context + LLM brief)")
  .option("--limit <n>", "brief at most N cases", (v) => Number(v))
  .option("--only <shas>", "comma-separated fix shas (prefixes allowed)")
  .option("--redo", "regenerate cases that already have a case file")
  .option("--provider <name>", "override LLM_PROVIDER: watsonx or bob")
  .option("--concurrency <n>", "cases briefed in parallel", (v) => Number(v), 3)
  .action(
    async (opts: {
      limit?: number;
      only?: string;
      redo?: boolean;
      provider?: string;
      concurrency: number;
    }) => {
      const base = config();
      if (opts.provider && opts.provider !== "watsonx" && opts.provider !== "bob") {
        throw new Error(`--provider must be watsonx or bob, got "${opts.provider}"`);
      }
      const cfg: Config = opts.provider ? { ...base, llmProvider: opts.provider as LlmProvider } : base;
      console.log(`briefing with ${cfg.llmProvider}...`);
      const { attempted, written } = await runBrief(
        cfg,
        { ...opts, only: splitList(opts.only) },
        consoleReporter(),
      );
      console.log(
        attempted
          ? `\n${written}/${attempted} case files written to ${path.relative(process.cwd(), cfg.casesDir)}`
          : "nothing to brief (use --redo to regenerate existing cases)",
      );
    },
  );

program
  .command("start")
  .description("export a clean playground for a case (the same as Take the case in the web app)")
  .argument("<id>", "case id (short sha)")
  .option("--reset", "discard any existing playground work and start over")
  .action(async (id: string, opts: { reset?: boolean }) => {
    const cfg = config();
    const c = readCase(cfg.casesDir, id);
    if (!c) throw new Error(`no case ${id} in ${cfg.casesDir}`);
    const res = await exportPlayground(c, cfg, Boolean(opts.reset));
    console.log(`${res.created ? "exported" : "kept existing"} playground for "${c.brief.codename}":`);
    console.log(`  ${res.path}`);
    console.log("  Open it in IBM Bob and switch to the Deja Mentor mode.");
  });

program
  .command("codenames")
  .description("give every case a unique codename (renames duplicates with the watsonx model)")
  .action(async () => {
    const n = await renameDuplicateCodenames(config(), consoleReporter());
    console.log(n ? `${n} case(s) renamed` : "all codenames are unique");
  });

program
  .command("models")
  .description("list the watsonx.ai chat models available to this account (banned models are hidden)")
  .action(async () => {
    const models = await WatsonxClient.fromConfig(config()).listChatModels();
    for (const m of models) console.log(`${m.modelId.padEnd(48)} ${m.provider}`);
    const granite = models.filter((m) => m.modelId.includes("granite") && !m.modelId.includes("guardian"));
    if (granite.length) console.log(`\nsuggested for WATSONX_MODEL_ID: ${granite.at(-1)!.modelId}`);
  });

program
  .command("serve")
  .description("start the local game server (REST + SSE) used by the web app")
  .action(async () => {
    const cfg = config();
    await startServer(cfg);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
