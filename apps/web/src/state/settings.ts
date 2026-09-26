import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LofiThemeId } from "../lib/lofi";

// Player-side settings, persisted in localStorage.

export interface SettingsState {
  repo?: string; // cases/<name>; undefined = the engine's default repository
  activeCaseId?: string; // the case the player took most recently and has not closed
  soundOn: boolean;
  volume: number; // 0..1
  reducedMotion: "system" | "on" | "off";
  musicOn: boolean; // lofi radio
  musicVolume: number; // 0..1
  musicTheme: LofiThemeId;
  setRepo: (repo?: string) => void;
  setActiveCase: (id?: string) => void;
  toggleSound: () => void;
  setVolume: (v: number) => void;
  setReducedMotion: (v: SettingsState["reducedMotion"]) => void;
  toggleMusic: () => void;
  setMusicVolume: (v: number) => void;
  setMusicTheme: (id: LofiThemeId) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      repo: undefined,
      activeCaseId: undefined,
      soundOn: true,
      volume: 0.3,
      reducedMotion: "system",
      musicOn: false,
      musicVolume: 0.4,
      musicTheme: "night-shift",
      setRepo: (repo) => set({ repo, activeCaseId: undefined }),
      setActiveCase: (activeCaseId) => set({ activeCaseId }),
      toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      toggleMusic: () => set((s) => ({ musicOn: !s.musicOn })),
      setMusicVolume: (musicVolume) => set({ musicVolume: Math.min(1, Math.max(0, musicVolume)) }),
      setMusicTheme: (musicTheme) => set({ musicTheme }),
    }),
    { name: "dejabug-settings" },
  ),
);

/** True when animations should be reduced to fades (system preference or explicit setting). */
export function useReducedMotion(): boolean {
  const pref = useSettings((s) => s.reducedMotion);
  if (pref === "on") return true;
  if (pref === "off") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
