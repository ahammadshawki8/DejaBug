import type {
  CaseSession,
  ForgeEvent,
  Funnel,
  PublicCase,
  RepoSummary,
  Reveal,
  VerifyResult,
} from "./client";

// Showcase backend (PROJECT.md 4.2 W7): the same API as the engine, served from the static export in
// public/showcase. Sessions and the profile live in localStorage. Test runs are REPLAYS of real recorded
// certification runs, and the UI labels them that way.

const BASE = `${import.meta.env.BASE_URL}showcase/`;
const SESSIONS_KEY = "dejabug-showcase-sessions";
const PROFILE_KEY = "dejabug-showcase-profile";

interface RevealFile extends Omit<Reveal, "playerDiff"> {
  failOutput: string;
  passOutput: string;
}

interface ForgeRecord {
  fixSha: string;
  subject: string;
  status: string;
  failRuns: number;
  passRuns: number;
  codename?: string;
}

interface ShowcaseSession extends CaseSession {
  fixReplayed?: boolean;
}

const cache = new Map<string, Promise<unknown>>();
function get<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    cache.set(
      file,
      fetch(BASE + file).then((r) => {
        if (!r.ok) throw new Error(`showcase data missing: ${file}`);
        return r.json();
      }),
    );
  }
  return cache.get(file) as Promise<T>;
}

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

async function repoName(repo?: string): Promise<string> {
  if (repo) return repo;
  const repos = await get<RepoSummary[]>("repos.json");
  return (repos.find((r) => r.default) ?? repos[0])?.name ?? "";
}

async function findCase(id: string, repo?: string): Promise<{ c: PublicCase; name: string }> {
  const name = await repoName(repo);
  const c = (await get<PublicCase[]>(`${name}/cases.json`)).find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  return { c, name };
}

function sessions(): Record<string, ShowcaseSession> {
  return read<Record<string, ShowcaseSession>>(SESSIONS_KEY, {});
}

function sessionFor(c: PublicCase): ShowcaseSession {
  return sessions()[`${c.repo}/${c.id}`] ?? { caseId: c.id, repo: c.repo, hintsRevealed: 0, verifyRuns: 0 };
}

function saveSession(s: ShowcaseSession): ShowcaseSession {
  const all = sessions();
  all[`${s.repo}/${s.caseId}`] = s;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
  return s;
}

function outcomeOf(output: string, pass: boolean): VerifyResult["outcome"] {
  if (pass) return "pass";
  if (/test timed out|\[killed after/.test(output)) return "hang";
  return "fail";
}

function failingTests(output: string): string[] {
  const go = [...output.matchAll(/^--- FAIL: (\S+)/gm)].map((m) => m[1] as string);
  const py = [...output.matchAll(/^FAILED \S+::(\S+?)(?:\[.*\])?(?: - .*)?$/gm)].map((m) => m[1] as string);
  return [...new Set([...go, ...py])];
}

// --- Forge replay: re-emits the real recorded certification outcomes at a watchable pace. ---
const listeners = new Set<(e: ForgeEvent) => void>();
let history: ForgeEvent[] = [];
let running = false;
const emit = (e: ForgeEvent) => {
  history.push(e);
  if (e.type === "done") running = false;
  listeners.forEach((l) => l(e));
};

async function replayForge(repo: string | undefined, limit: number, workers: number): Promise<void> {
  const name = await repoName(repo);
  const records = (await get<ForgeRecord[]>(`${name}/forge.json`)).slice(0, limit);
  const repos = await get<RepoSummary[]>("repos.json");
  const funnel = repos.find((r) => r.name === name)?.funnel;
  history = [];
  running = true;
  emit({ type: "log", message: `Showcase replay: real recorded results for ${records.length} candidates.` });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let next = 0;
  const worker = async (w: number) => {
    while (next < records.length) {
      const r = records[next++] as ForgeRecord;
      emit({ type: "stage", worker: w, fixSha: r.fixSha, stage: "certify", detail: r.subject });
      for (let i = 1; i <= Math.max(1, Math.min(3, r.failRuns || 1)); i++) {
        await wait(450);
        emit({ type: "run", worker: w, fixSha: r.fixSha, phase: "fail", attempt: i, ok: r.failRuns >= i });
      }
      if (r.status === "certified") {
        await wait(400);
        emit({ type: "run", worker: w, fixSha: r.fixSha, phase: "pass", attempt: 1, ok: true });
        emit({ type: "result", worker: w, fixSha: r.fixSha, status: "certified" });
        if (r.codename) {
          emit({ type: "stage", worker: w, fixSha: r.fixSha, stage: "brief", detail: r.subject });
          await wait(900);
          emit({ type: "briefed", worker: w, fixSha: r.fixSha, ok: true, codename: r.codename });
        }
      } else {
        await wait(300);
        emit({ type: "result", worker: w, fixSha: r.fixSha, status: r.status as never });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, workers) }, (_, i) => worker(i)));
  if (funnel) emit({ type: "funnel", funnel });
  emit({ type: "done" });
}

export const showcaseApi = {
  health: async () => ({ ok: true, repo: "showcase" }),
  repos: () => get<RepoSummary[]>("repos.json"),
  cases: async (repo?: string) => get<PublicCase[]>(`${await repoName(repo)}/cases.json`),
  case: async (id: string, repo?: string) => {
    const { c } = await findCase(id, repo);
    return { case: c, session: sessionFor(c) as CaseSession };
  },
  session: async (id: string, repo?: string) => {
    const { c, name } = await findCase(id, repo);
    const s = sessionFor(c);
    const r = await get<RevealFile>(`${name}/${id}.json`);
    return { session: s as CaseSession, hints: r.hints.slice(0, s.hintsRevealed) };
  },
  start: async (id: string, repo?: string, reset = false) => {
    const { c } = await findCase(id, repo);
    const prev = sessionFor(c);
    const fresh = reset || !prev.startedAt;
    const s = saveSession(
      fresh
        ? {
            caseId: c.id,
            repo: c.repo,
            hintsRevealed: 0,
            verifyRuns: 0,
            startedAt: new Date().toISOString(),
            playgroundPath: "Showcase mode: install DejaBug locally for a real playground",
          }
        : prev,
    );
    return { path: s.playgroundPath ?? "", created: fresh, session: s as CaseSession };
  },
  hint: async (id: string, n: number, repo?: string) => {
    const { c, name } = await findCase(id, repo);
    const s = sessionFor(c);
    if (!s.startedAt) throw new Error("take the case first");
    if (n > s.hintsRevealed + 1) throw new Error(`open hint ${s.hintsRevealed + 1} first`);
    const r = await get<RevealFile>(`${name}/${id}.json`);
    s.hintsRevealed = Math.max(s.hintsRevealed, n);
    return { n, hint: r.hints[n - 1] as string, session: saveSession(s) as CaseSession };
  },
  verify: async (id: string, repo?: string) => {
    const { c, name } = await findCase(id, repo);
    const s = sessionFor(c);
    if (!s.startedAt) throw new Error("take the case first");
    const r = await get<RevealFile>(`${name}/${id}.json`);
    await new Promise((res) => setTimeout(res, 900));
    const pass = Boolean(s.fixReplayed);
    const raw = pass ? r.passOutput : r.failOutput;
    const output = `[showcase replay of a real recorded run]\n${raw}`;
    s.verifyRuns++;
    if (pass && !s.solvedAt && !s.gaveUpAt) s.solvedAt = new Date().toISOString();
    saveSession(s);
    const result: VerifyResult = {
      pass,
      outcome: outcomeOf(raw, pass),
      failingTests: pass ? [] : failingTests(raw),
      output,
      durationMs: 900,
    };
    return { result, session: s as CaseSession };
  },
  /** Showcase only: marks the original fix as applied, so the next run replays the recorded pass. */
  replayFix: async (id: string, repo?: string) => {
    const { c } = await findCase(id, repo);
    saveSession({ ...sessionFor(c), fixReplayed: true });
  },
  giveUp: async (id: string, repo?: string) => {
    const { c } = await findCase(id, repo);
    const s = sessionFor(c);
    if (!s.solvedAt) s.gaveUpAt ??= new Date().toISOString();
    return { session: saveSession(s) as CaseSession };
  },
  reveal: async (id: string, repo?: string) => {
    const { c, name } = await findCase(id, repo);
    const s = sessionFor(c);
    if (!s.solvedAt && !s.gaveUpAt) throw new Error("solve the case or give up to see the original fix");
    const r = await get<RevealFile>(`${name}/${id}.json`);
    const reveal: Reveal = {
      fixDiff: r.fixDiff,
      playerDiff: s.fixReplayed ? r.fixDiff : "",
      lesson: r.lesson,
      hints: r.hints,
      original: r.original,
      prNumber: r.prNumber,
    };
    return { reveal, session: s as CaseSession };
  },
  funnel: async (repo?: string): Promise<Funnel | null> => {
    const name = await repoName(repo);
    return (await get<RepoSummary[]>("repos.json")).find((r) => r.name === name)?.funnel ?? null;
  },
  profile: async () => read<unknown>(PROFILE_KEY, null),
  saveProfile: async (profile: unknown) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return { ok: true };
  },
  startForge: async (body: { repo?: string; limit?: number; concurrency?: number }) => {
    if (running) throw new Error("a replay is already running");
    if (body.repo?.includes("/"))
      throw new Error("Showcase mode replays recorded runs only. Install DejaBug to forge a new repository.");
    void replayForge(body.repo, Math.min(40, body.limit ?? 8), Math.min(8, body.concurrency ?? 4));
    return { started: true, repo: body.repo ?? "showcase" };
  },
  forgeStatus: async () => ({ running, repo: "showcase", events: history.length }),
};

export function subscribeShowcaseForge(onEvent: (e: ForgeEvent) => void): () => void {
  history.forEach(onEvent);
  listeners.add(onEvent);
  return () => listeners.delete(onEvent);
}
