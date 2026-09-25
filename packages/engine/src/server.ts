import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { detectAdapter } from "./adapters/index.js";
import { loadConfig, normalizeSlug, type Config } from "./config.js";
import { activateToolchain, initRepo, runForge, type ForgeRunOptions } from "./forge.js";
import { exportPlayground, playerDiff } from "./play.js";
import { readCandidates, readCase, readCases, readFunnel, writeJsonAtomic } from "./store.js";
import type { Case, CaseSession, ForgeEvent, PublicCase, Reveal } from "./types.js";
import { verify } from "./verify.js";

// Local game server (PROJECT.md 4.1 F9, Section 5 REST API). The web app talks only to this.

export interface ServerDeps {
  runForge: typeof runForge;
  verify: typeof verify;
}

interface State {
  sessions: Record<string, CaseSession>;
  profile?: unknown;
}

const REPO_NAME = /^[A-Za-z0-9_.-]+$/;
const MAX_PROFILE_BYTES = 64 * 1024;

export function toPublicCase(c: Case): PublicCase {
  const { fixDiff: _fixDiff, brief, ...rest } = c;
  const { hints: _hints, lesson: _lesson, ...visible } = brief;
  return { ...rest, brief: visible, hintCount: brief.hints.length };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function buildServer(baseCfg: Config, deps: Partial<ServerDeps> = {}): FastifyInstance {
  const d: ServerDeps = { runForge, verify, ...deps };
  const app = Fastify({ logger: false });
  const stateDir = path.join(baseCfg.repoRoot, ".dejabug");
  const stateFile = path.join(stateDir, "state.json");
  const state: State = existsSync(stateFile)
    ? (JSON.parse(readFileSync(stateFile, "utf8")) as State)
    : { sessions: {} };
  const save = () => {
    mkdirSync(stateDir, { recursive: true });
    writeJsonAtomic(stateFile, state);
  };

  const casesRoot = path.dirname(baseCfg.casesDir);
  const defaultRepo = path.basename(baseCfg.casesDir);

  /** Config for a repository folder under cases/ (the default target when omitted). */
  const repoConfig = (name?: string): Config => {
    if (!name || name === defaultRepo) return baseCfg;
    if (!REPO_NAME.test(name)) throw new HttpError(400, "invalid repo name");
    const slug = readCandidates(path.join(casesRoot, name))?.repo;
    if (!slug) throw new HttpError(404, `unknown repo "${name}"`);
    return loadConfig(process.env, baseCfg.repoRoot, { target: slug });
  };

  const loadCase = (cfg: Config, id: string): Case => {
    const c = readCase(cfg.casesDir, id);
    if (!c) throw new HttpError(404, `no case ${id}`);
    return c;
  };

  const sessionFor = (c: Case): CaseSession => {
    const key = `${c.repo}/${c.id}`;
    state.sessions[key] ??= { caseId: c.id, repo: c.repo, hintsRevealed: 0, verifyRuns: 0 };
    return state.sessions[key];
  };

  const requireStarted = (s: CaseSession) => {
    if (!s.startedAt) throw new HttpError(409, "take the case first (POST .../start)");
  };

  app.setErrorHandler((err, _req, reply) => {
    const status =
      err instanceof HttpError ? err.status : ((err as { statusCode?: number }).statusCode ?? 500);
    void reply.status(status).send({ error: err instanceof Error ? err.message : String(err) });
  });

  type RepoQuery = { Querystring: { repo?: string } };
  type CaseParams = RepoQuery & { Params: { id: string } };

  app.get("/api/health", async () => ({ ok: true, repo: baseCfg.repoSlug }));

  app.get("/api/repos", async () => {
    if (!existsSync(casesRoot)) return [];
    return readdirSync(casesRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && REPO_NAME.test(e.name))
      .map((e) => {
        const dir = path.join(casesRoot, e.name);
        const candidates = readCandidates(dir);
        return {
          name: e.name,
          slug: candidates?.repo ?? e.name,
          language: candidates?.language,
          caseCount: readCases(dir).length,
          funnel: readFunnel(dir) ?? null,
          default: e.name === defaultRepo,
        };
      })
      .filter((r) => r.caseCount > 0 || r.funnel);
  });

  app.get<RepoQuery>("/api/cases", async (req) =>
    readCases(repoConfig(req.query.repo).casesDir).map(toPublicCase),
  );

  app.get<CaseParams>("/api/cases/:id", async (req) => {
    const c = loadCase(repoConfig(req.query.repo), req.params.id);
    return { case: toPublicCase(c), session: sessionFor(c) };
  });

  app.get<CaseParams>("/api/cases/:id/session", async (req) => {
    const c = loadCase(repoConfig(req.query.repo), req.params.id);
    const s = sessionFor(c);
    return { session: s, hints: c.brief.hints.slice(0, s.hintsRevealed) };
  });

  app.post<CaseParams & { Body: { reset?: boolean } | null }>("/api/cases/:id/start", async (req) => {
    const cfg = repoConfig(req.query.repo);
    const c = loadCase(cfg, req.params.id);
    const reset = Boolean(req.body?.reset);
    const result = await exportPlayground(c, cfg, reset);
    const s = sessionFor(c);
    if (reset || !s.startedAt) {
      Object.assign(s, { startedAt: new Date().toISOString(), hintsRevealed: 0, verifyRuns: 0 });
      delete s.solvedAt;
      delete s.gaveUpAt;
    }
    s.playgroundPath = result.path;
    save();
    return { path: result.path, created: result.created, session: s };
  });

  app.post<CaseParams & { Params: { id: string; n: string } }>("/api/cases/:id/hint/:n", async (req) => {
    const c = loadCase(repoConfig(req.query.repo), req.params.id);
    const s = sessionFor(c);
    requireStarted(s);
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 1 || n > c.brief.hints.length) throw new HttpError(400, "no such hint");
    if (n > s.hintsRevealed + 1) throw new HttpError(409, `open hint ${s.hintsRevealed + 1} first`);
    s.hintsRevealed = Math.max(s.hintsRevealed, n);
    save();
    return { n, hint: c.brief.hints[n - 1], session: s };
  });

  app.post<CaseParams>("/api/cases/:id/verify", async (req) => {
    const cfg = repoConfig(req.query.repo);
    const c = loadCase(cfg, req.params.id);
    const s = sessionFor(c);
    requireStarted(s);
    activateToolchain(cfg);
    const result = await d.verify(c, cfg);
    s.verifyRuns++;
    if (result.pass && !s.solvedAt && !s.gaveUpAt) s.solvedAt = new Date().toISOString();
    save();
    return { result, session: s };
  });

  app.post<CaseParams>("/api/cases/:id/giveup", async (req) => {
    const c = loadCase(repoConfig(req.query.repo), req.params.id);
    const s = sessionFor(c);
    requireStarted(s);
    if (!s.solvedAt) s.gaveUpAt ??= new Date().toISOString();
    save();
    return { session: s };
  });

  app.get<CaseParams>("/api/cases/:id/reveal", async (req) => {
    const cfg = repoConfig(req.query.repo);
    const c = loadCase(cfg, req.params.id);
    const s = sessionFor(c);
    if (!s.solvedAt && !s.gaveUpAt)
      throw new HttpError(403, "solve the case or give up to see the original fix");
    const reveal: Reveal = {
      fixDiff: c.fixDiff,
      playerDiff: await playerDiff(c, cfg),
      lesson: c.brief.lesson,
      hints: c.brief.hints,
      original: c.original,
      prNumber: c.prNumber,
    };
    return { reveal, session: s };
  });

  app.get<RepoQuery>("/api/funnel", async (req) => readFunnel(repoConfig(req.query.repo).casesDir) ?? null);

  app.get("/api/profile", async () => state.profile ?? null);

  app.put<{ Body: unknown }>("/api/profile", async (req) => {
    if (JSON.stringify(req.body ?? null).length > MAX_PROFILE_BYTES)
      throw new HttpError(413, "profile too large");
    state.profile = req.body;
    save();
    return { ok: true };
  });

  // --- Forge: one pipeline run at a time, streamed to any number of SSE clients ---
  const forge = { running: false, repo: "", history: [] as ForgeEvent[], emitter: new EventEmitter() };
  forge.emitter.setMaxListeners(100);
  forge.emitter.on("forge", (e: ForgeEvent) => {
    forge.history.push(e);
    if (e.type === "done") forge.running = false;
  });

  app.post<{ Body: { repo?: string; limit?: number; concurrency?: number } | null }>(
    "/api/forge",
    async (req, reply) => {
      if (forge.running) throw new HttpError(409, `a forge run is already in progress for ${forge.repo}`);
      const body = req.body ?? {};
      const cfg = body.repo?.includes("/")
        ? loadConfig(process.env, baseCfg.repoRoot, { target: normalizeSlug(body.repo) })
        : repoConfig(body.repo);
      const opts: ForgeRunOptions = {
        limit: Math.min(Math.max(1, Number(body.limit ?? 8)), 40),
        concurrency: Math.min(Math.max(1, Number(body.concurrency ?? 4)), 8),
      };
      forge.running = true;
      forge.repo = cfg.repoSlug;
      forge.history = [];
      void (async () => {
        if (!detectAdapter(cfg.repoDir)) {
          forge.emitter.emit("forge", {
            type: "log",
            message: `cloning ${cfg.repoSlug}...`,
          } satisfies ForgeEvent);
          try {
            initRepo(cfg);
          } catch (err) {
            forge.emitter.emit("forge", {
              type: "log",
              message: `clone failed: ${String(err)}`,
            } satisfies ForgeEvent);
          }
        }
        await d.runForge(cfg, opts, forge.emitter);
      })();
      return reply.status(202).send({ started: true, repo: cfg.repoSlug, ...opts });
    },
  );

  app.get("/api/forge/status", async () => ({
    running: forge.running,
    repo: forge.repo,
    events: forge.history.length,
  }));

  app.get("/api/forge/events", (req, reply: FastifyReply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = (e: ForgeEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    forge.history.forEach(send);
    forge.emitter.on("forge", send);
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      forge.emitter.off("forge", send);
    });
  });

  return app;
}

export async function startServer(cfg: Config): Promise<FastifyInstance> {
  const app = buildServer(cfg);
  await app.listen({ port: cfg.port, host: "127.0.0.1" });
  console.log(`dejabug engine listening on http://localhost:${cfg.port} (${cfg.repoSlug})`);
  return app;
}
