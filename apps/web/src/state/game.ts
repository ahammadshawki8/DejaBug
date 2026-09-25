import { create } from "zustand";
import { api, type PublicCase, type RepoSummary } from "../api/client";

// Server data shared across screens: repositories and their public cases.

type Status = "idle" | "loading" | "ready" | "error";

export interface GameState {
  repos: RepoSummary[];
  cases: PublicCase[];
  casesRepo?: string;
  status: Status;
  error?: string;
  loadRepos: () => Promise<void>;
  loadCases: (repo?: string, force?: boolean) => Promise<void>;
}

export const useGame = create<GameState>()((set, get) => ({
  repos: [],
  cases: [],
  casesRepo: undefined,
  status: "idle",
  error: undefined,
  loadRepos: async () => {
    try {
      set({ repos: await api.repos() });
    } catch (err) {
      set({ status: "error", error: (err as Error).message });
    }
  },
  loadCases: async (repo, force = false) => {
    if (!force && get().status === "ready" && get().casesRepo === repo) return;
    set({ status: "loading", error: undefined });
    try {
      const cases = await api.cases(repo);
      set({ cases, casesRepo: repo, status: "ready" });
    } catch (err) {
      set({ status: "error", error: (err as Error).message });
    }
  },
}));
