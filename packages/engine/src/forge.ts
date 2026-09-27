import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ADAPTERS, detectAdapter } from "./adapters/index.js";
import { commandVersion } from "./adapters/tool.js";
import type { LanguageAdapter } from "./adapters/types.js";
import { assembleCase, bugAgeDays } from "./assemble.js";
import { brief } from "./briefer.js";
import { certify } from "./certifier.js";
import { casesNeedingRename, ensureUniqueCodenames, watsonxNamer } from "./codenames.js";
import type { Config } from "./config.js";
import { git } from "./git.js";
import { createGitHubClient, fetchContext, fetchOriginalEffort } from "./github.js";
import { mine } from "./miner.js";
import { TEMPLATE_BRIEFED_BY, aiKeyMissing, templateBrief } from "./templateBrief.js";
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

/**
 * Clones owner/name into the workspace if needed and returns the detected adapter (if any). Python
 * repositories also get their own virtualenv (see ensurePythonEnv), so a fresh machine can play them.
 */
export function initRepo(cfg: Config): LanguageAdapter | undefined {
  if (!existsSync(path.join(cfg.repoDir, ".git"))) {
    mkdirSync(path.dirname(cfg.repoDir), { recursive: true });
    execFileSync("git", ["clone", "--quiet", `https://github.com/${cfg.repoSlug}.git`, cfg.repoDir], {
      stdio: "ignore",
    });
  }
  const adapter = detectAdapter(cfg.repoDir);
  if (adapter?.name === "Python") ensurePythonEnv(cfg);
  return adapter;
}

function venvDir(cfg: Config): string {
  return path.join(path.dirname(cfg.repoDir), ".venvs", path.basename(cfg.repoDir));
}

function venvPython(venv: string): string {
  return process.platform === "win32"
    ? path.join(venv, "Scripts", "python.exe")
    : path.join(venv, "bin", "python");
}

/**
 * Creates workspace/.venvs/<repo> once, with the project installed in editable mode (plus its "dev" or
 * "test" extras when it declares them) and pytest. Skipped when the user pins their own interpreter.
 */
export function ensurePythonEnv(cfg: Config): void {
  const venv = venvDir(cfg);
  if (process.env.DEJABUG_PYTHON_PINNED || existsSync(venvPython(venv))) return;
  const base = (process.platform === "win32" ? ["python", "py"] : ["python3", "python"]).find((cmd) =>
    commandVersion(cmd, ["--version"]),
  );
  if (!base) throw new Error("Python 3 is not installed (needed for this repository's tests)");
  execFileSync(base, ["-m", "venv", venv], { stdio: "ignore" });
  const pyproject = path.join(cfg.repoDir, "pyproject.toml");
  const text = existsSync(pyproject) ? readFileSync(pyproject, "utf8") : "";
  // An optional-dependencies group such as `dev = [` in pyproject.toml.
  const extra = ["dev", "test", "tests"].find((e) =>
    text.split(/\r?\n/).some((line) => /^\s*=\s*\[/.test(line.startsWith(e) ? line.slice(e.length) : "")),
  );
  const spec = extra ? `${cfg.repoDir}[${extra}]` : cfg.repoDir;
  execFileSync(venvPython(venv), ["-m", "pip", "install", "--quiet", "-e", spec, "pytest"], {
    stdio: "ignore",
    timeout: 10 * 60_000,
  });
}

/**
 * Uses a per-repository virtualenv when one exists at workspace/.venvs/<repo> (Python projects),
 * so each repository runs its tests with its own dependencies. An explicit DEJABUG_PYTHON wins.
 */
export function activateToolchain(cfg: Config): void {
  const name = path.basename(cfg.repoDir);
  const venv = path.join(path.dirname(cfg.repoDir), ".venvs", name);
  const exe =
    process.platform === "win32"
      ? path.join(venv, "Scripts", "python.exe")
      : path.join(venv, "bin", "python");
  if (existsSync(exe) && !process.env.DEJABUG_PYTHON_PINNED) process.env.DEJABUG_PYTHON = exe;
}

/** The target repo's language adapter, with its toolchain verified. Throws with a fix-it message otherwise. */
export function requireAdapter(cfg: Config): LanguageAdapter {
  activateToolchain(cfg);
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

  // Relay the certifier's events, adding each commit's subject to stage events so the Forge Console
  // lanes can show what is being certified (the certifier itself only knows shas).
  const subjects = new Map(queue.map((c) => [c.fixSha, c.subject]));
  const relay = new EventEmitter();
  relay.on("forge", (e: ForgeEvent) =>
    emitForge(emitter, e.type === "stage" ? { ...e, detail: e.detail ?? subjects.get(e.fixSha) } : e),
  );
  const results = queue.length ? await certify(queue, cfg.repoDir, relay, opts.concurrency ?? 4) : [];
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
  // No AI key (for example after a hackathon account closes): write the case files from the proof data.
  const noAi = aiKeyMissing(cfg);
  const briefedBy = noAi
    ? TEMPLATE_BRIEFED_BY
    : cfg.llmProvider === "bob"
      ? "bob-shell"
      : `watsonx:${cfg.watsonx.modelId ?? "unknown"}`;

  let written = 0;
  let next = 0;
  const worker = async (slot: number) => {
    while (next < queue.length) {
      const cert = queue[next++]!;
      const candidate = candidates.candidates.find((c) => c.fixSha === cert.fixSha);
      if (!candidate) continue;
      emitForge(emitter, {
        type: "stage",
        worker: slot,
        fixSha: cert.fixSha,
        stage: "brief",
        detail: candidate.subject,
      });
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
        // The AI brief, or the tests-only case file when there is no key or the AI call fails (for example
        // a wrong or expired key), so a proven bug is never lost.
        let result = noAi
          ? null
          : await brief({ candidate, certification: cert, context, fixDiff }, cfg).catch((err: unknown) => {
              emitForge(emitter, {
                type: "log",
                message: `${cert.fixSha.slice(0, 7)}: AI brief failed (${String(err)}); writing it from the tests`,
              });
              return null;
            });
        let caseBriefedBy = briefedBy;
        if (!result) {
          result = templateBrief(candidate, cert, fixDiff);
          caseBriefedBy = TEMPLATE_BRIEFED_BY;
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
          briefedBy: caseBriefedBy,
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
    if (aiKeyMissing(cfg))
      emitForge(emitter, {
        type: "log",
        message:
          "No AI key in .env (watsonx.ai or BOB_API_KEY): case files will be written from the tests, without AI. Add a key for richer briefs.",
      });
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
