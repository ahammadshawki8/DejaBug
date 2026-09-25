import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ADAPTERS, detectAdapter } from "./adapters/index.js";
import type { LanguageAdapter } from "./adapters/types.js";
import { assembleCase, bugAgeDays } from "./assemble.js";
import { brief } from "./briefer.js";
import { certify } from "./certifier.js";
import { casesNeedingRename, ensureUniqueCodenames, watsonxNamer } from "./codenames.js";
import type { Config } from "./config.js";
import { git } from "./git.js";
import { createGitHubClient, fetchContext, fetchOriginalEffort } from "./github.js";
import { mine } from "./miner.js";
import {
  computeFunnel,
  mergeCertifications,
  readCandidates,
  readCases,
  readCertifications,
  readRanking,
  writeCase,
  writeFunnel,
} from "./store.js";
import type { CandidatesFile, Certification, ForgeEvent, Funnel } from "./types.js";

// The forge pipeline (mine -> certify -> brief), shared by the CLI and the server. Progress is
// reported as ForgeEvents on the "forge" channel of an EventEmitter (streamed over SSE by the server).

export function emitForge(emitter: EventEmitter | undefined, event: ForgeEvent): void {
  emitter?.emit("forge", event);
}

/** Clones owner/name into the workspace if needed and returns the detected adapter (if any). */
export function initRepo(cfg: Config): LanguageAdapter | undefined {
  if (!existsSync(path.join(cfg.repoDir, ".git"))) {
    mkdirSync(path.dirname(cfg.repoDir), { recursive: true });
    execFileSync("git", ["clone", "--quiet", `https://github.com/${cfg.repoSlug}.git`, cfg.repoDir], {
      stdio: "ignore",
    });
  }
  return detectAdapter(cfg.repoDir);
}

/** The target repo's language adapter, with its toolchain verified. Throws with a fix-it message otherwise. */
export function requireAdapter(cfg: Config): LanguageAdapter {
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

export async function runMine(cfg: Config, out?: string, maxCommits?: number): Promise<CandidatesFile> {
  const result = await mine(cfg.repoDir, { maxCommits });
  const file: CandidatesFile = { repo: cfg.repoSlug, generatedAt: new Date().toISOString(), ...result };
  const target = out ?? path.join(cfg.casesDir, "candidates.json");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(file, null, 2) + "\n");
  return file;
}

export interface QueueOptions {
  limit?: number;
  only?: string[];
  redo?: boolean;
  concurrency?: number;
}

function selectShas<T extends { fixSha: string }>(items: T[], done: Set<string>, opts: QueueOptions): T[] {
  const only = opts.only?.map((s) => s.trim().toLowerCase()).filter(Boolean);
  let queue = items.filter((c) =>
    only?.length ? only.some((p) => c.fixSha.startsWith(p)) : opts.redo || !done.has(c.fixSha),
  );
  if (opts.limit) queue = queue.slice(0, opts.limit);
  return queue;
}

export interface CertifyRun {
  results: Certification[];
  funnel: Funnel;
}

export async function runCertify(
  cfg: Config,
  opts: QueueOptions,
  emitter?: EventEmitter,
): Promise<CertifyRun> {
  const file = readCandidates(cfg.casesDir);
  if (!file) throw new Error(`no candidates.json in ${cfg.casesDir}; run "dejabug mine" first`);
  requireAdapter(cfg);
  const done = new Set((readCertifications(cfg.casesDir)?.results ?? []).map((r) => r.fixSha));
  const queue = selectShas(file.candidates, done, opts);

  const results = queue.length
    ? await certify(queue, cfg.repoDir, emitter ?? new EventEmitter(), opts.concurrency ?? 4)
    : [];
  const merged = mergeCertifications(cfg.casesDir, file.repo, results);
  const funnel = computeFunnel(file, merged.results);
  writeFunnel(cfg.casesDir, funnel);
  emitForge(emitter, { type: "funnel", funnel });
  return { results, funnel };
}

export interface BriefRun {
  attempted: number;
  written: number;
}

/** Briefs certified cases into case files, `concurrency` at a time, then enforces unique codenames. */
export async function runBrief(cfg: Config, opts: QueueOptions, emitter?: EventEmitter): Promise<BriefRun> {
  const candidates = readCandidates(cfg.casesDir);
  const certs = readCertifications(cfg.casesDir);
  if (!candidates || !certs) throw new Error(`run "dejabug mine" and "dejabug certify" first`);
  const ranking = readRanking(cfg.casesDir);
  const existing = new Set(readCases(cfg.casesDir).map((c) => c.fixSha));
  const queue = selectShas(
    certs.results.filter((r) => r.status === "certified"),
    existing,
    opts,
  );
  const gh = createGitHubClient(cfg);
  const briefedBy = cfg.llmProvider === "bob" ? "bob-shell" : `watsonx:${cfg.watsonx.modelId ?? "unknown"}`;

  let written = 0;
  let next = 0;
  const worker = async (slot: number) => {
    while (next < queue.length) {
      const cert = queue[next++]!;
      const candidate = candidates.candidates.find((c) => c.fixSha === cert.fixSha);
      if (!candidate) continue;
      emitForge(emitter, { type: "stage", worker: slot, fixSha: cert.fixSha, stage: "brief" });
      try {
        const [context, original] = await Promise.all([
          fetchContext(gh, candidate),
          fetchOriginalEffort(gh, candidate),
        ]);
        const fixDiff = await git(cfg.repoDir, [
          "diff",
          candidate.parentSha,
          candidate.fixSha,
          "--",
          ...candidate.sourceFiles,
        ]);
        const result = await brief({ candidate, certification: cert, context, fixDiff }, cfg);
        if (!result) {
          emitForge(emitter, { type: "briefed", worker: slot, fixSha: cert.fixSha, ok: false });
          continue;
        }
        const c = assembleCase({
          repo: candidates.repo,
          candidate,
          certification: cert,
          brief: result,
          ranking: ranking?.cases.find((r) => cert.fixSha.startsWith(r.fixSha)),
          prNumber: context.prNumber,
          original,
          bugAgeDays: await bugAgeDays(cfg.repoDir, candidate, fixDiff),
          fixDiff,
          briefedBy,
        });
        writeCase(cfg.casesDir, c);
        written++;
        emitForge(emitter, {
          type: "briefed",
          worker: slot,
          fixSha: cert.fixSha,
          ok: true,
          codename: c.brief.codename,
        });
      } catch (err) {
        emitForge(emitter, { type: "log", message: `${cert.fixSha.slice(0, 7)}: ${String(err)}` });
        emitForge(emitter, { type: "briefed", worker: slot, fixSha: cert.fixSha, ok: false });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 3) }, (_, i) => worker(i)));
  await renameDuplicateCodenames(cfg, emitter);
  return { attempted: queue.length, written };
}

/** Renames duplicate codenames with the watsonx model (no-op when there are none or no credentials). */
export async function renameDuplicateCodenames(cfg: Config, emitter?: EventEmitter): Promise<number> {
  const cases = readCases(cfg.casesDir);
  if (casesNeedingRename(cases).length === 0) return 0;
  if (!cfg.watsonx.apiKey || !cfg.watsonx.modelId) {
    emitForge(emitter, {
      type: "log",
      message: "duplicate codenames found; set watsonx credentials and run `dejabug codenames`",
    });
    return 0;
  }
  const renamed = await ensureUniqueCodenames(cases, watsonxNamer(cfg));
  for (const c of renamed) {
    writeCase(cfg.casesDir, c);
    emitForge(emitter, { type: "log", message: `renamed ${c.id} -> "${c.brief.codename}"` });
  }
  return renamed.length;
}

export interface ForgeRunOptions extends QueueOptions {
  briefConcurrency?: number;
}

/** The whole pipeline for the UI's "Forge N cases" button. Emits `done` at the end, even on error. */
export async function runForge(cfg: Config, opts: ForgeRunOptions, emitter: EventEmitter): Promise<void> {
  try {
    if (!readCandidates(cfg.casesDir)) {
      emitForge(emitter, { type: "log", message: `mining ${cfg.repoSlug}...` });
      const mined = await runMine(cfg);
      emitForge(emitter, {
        type: "log",
        message: `${mined.fixLikeCommits} fix-like commits, ${mined.candidates.length} candidates`,
      });
    }
    const { results } = await runCertify(cfg, opts, emitter);
    const certified = results.filter((r) => r.status === "certified").map((r) => r.fixSha);
    if (certified.length) {
      await runBrief(cfg, { only: certified, concurrency: opts.briefConcurrency ?? 3 }, emitter);
    }
  } catch (err) {
    emitForge(emitter, {
      type: "log",
      message: `forge failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    emitForge(emitter, { type: "done" });
  }
}
