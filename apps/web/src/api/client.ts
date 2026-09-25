import type { CaseSession, ForgeEvent, Funnel, PublicCase, Reveal, VerifyResult } from "@engine/types";

// Typed client for the local game server (packages/engine/src/server.ts).

export type { CaseSession, ForgeEvent, Funnel, PublicCase, Reveal, VerifyResult };

export interface RepoSummary {
  name: string;
  slug: string;
  language?: string;
  caseCount: number;
  funnel: Funnel | null;
  default: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "The engine is not reachable. Start it with `npm run dev`.");
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

const q = (repo?: string) => (repo ? `?repo=${encodeURIComponent(repo)}` : "");

export const api = {
  health: () => request<{ ok: boolean; repo: string }>("GET", "/api/health"),
  repos: () => request<RepoSummary[]>("GET", "/api/repos"),
  cases: (repo?: string) => request<PublicCase[]>("GET", `/api/cases${q(repo)}`),
  case: (id: string, repo?: string) =>
    request<{ case: PublicCase; session: CaseSession }>("GET", `/api/cases/${id}${q(repo)}`),
  session: (id: string, repo?: string) =>
    request<{ session: CaseSession; hints: string[] }>("GET", `/api/cases/${id}/session${q(repo)}`),
  start: (id: string, repo?: string, reset = false) =>
    request<{ path: string; created: boolean; session: CaseSession }>(
      "POST",
      `/api/cases/${id}/start${q(repo)}`,
      { reset },
    ),
  hint: (id: string, n: number, repo?: string) =>
    request<{ n: number; hint: string; session: CaseSession }>(
      "POST",
      `/api/cases/${id}/hint/${n}${q(repo)}`,
    ),
  verify: (id: string, repo?: string) =>
    request<{ result: VerifyResult; session: CaseSession }>("POST", `/api/cases/${id}/verify${q(repo)}`),
  giveUp: (id: string, repo?: string) =>
    request<{ session: CaseSession }>("POST", `/api/cases/${id}/giveup${q(repo)}`),
  reveal: (id: string, repo?: string) =>
    request<{ reveal: Reveal; session: CaseSession }>("GET", `/api/cases/${id}/reveal${q(repo)}`),
  funnel: (repo?: string) => request<Funnel | null>("GET", `/api/funnel${q(repo)}`),
  profile: () => request<unknown>("GET", "/api/profile"),
  saveProfile: (profile: unknown) => request<{ ok: boolean }>("PUT", "/api/profile", profile),
  startForge: (body: { repo?: string; limit?: number; concurrency?: number }) =>
    request<{ started: boolean; repo: string }>("POST", "/api/forge", body),
  forgeStatus: () => request<{ running: boolean; repo: string; events: number }>("GET", "/api/forge/status"),
};

/** Subscribes to the forge SSE stream. Returns an unsubscribe function. */
export function subscribeForge(onEvent: (e: ForgeEvent) => void): () => void {
  const source = new EventSource("/api/forge/events");
  source.onmessage = (msg) => onEvent(JSON.parse(msg.data as string) as ForgeEvent);
  return () => source.close();
}
