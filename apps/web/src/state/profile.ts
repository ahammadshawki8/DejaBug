import { create } from "zustand";
import { api } from "../api/client";

// Player profile: XP, solved cases, streak. Persisted on the engine (GET/PUT /api/profile) so it survives
// browser resets. T6.1 extends this with badges and precinct mastery.

export interface SolveRecord {
  caseId: string;
  repo: string;
  xp: number;
  seconds: number;
  hints: number;
  solvedAt: string; // ISO
}

export interface Profile {
  name: string;
  xp: number;
  solves: SolveRecord[];
  badges: string[];
}

const EMPTY: Profile = { name: "Rookie", xp: 0, solves: [], badges: [] };

export interface ProfileState {
  profile: Profile;
  loaded: boolean;
  load: () => Promise<void>;
  save: (p: Profile) => Promise<void>;
}

export const useProfile = create<ProfileState>()((set) => ({
  profile: EMPTY,
  loaded: false,
  load: async () => {
    try {
      const stored = (await api.profile()) as Partial<Profile> | null;
      set({ profile: { ...EMPTY, ...(stored ?? {}) }, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  save: async (profile) => {
    set({ profile });
    await api.saveProfile(profile).catch(() => undefined);
  },
}));

/** Consecutive days (ending today or yesterday) with at least one solve. */
export function streakDays(solves: SolveRecord[], today = new Date()): number {
  const days = new Set(solves.map((s) => s.solvedAt.slice(0, 10)));
  const d = new Date(today);
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
