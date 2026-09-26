import { Fire } from "pixelarticons/react/Fire.js";
import { Folder } from "pixelarticons/react/Folder.js";
import { Music } from "pixelarticons/react/Music.js";
import { Search } from "pixelarticons/react/Search.js";
import { Sliders } from "pixelarticons/react/Sliders.js";
import { Trophy } from "pixelarticons/react/Trophy.js";
import { Volume3 } from "pixelarticons/react/Volume3.js";
import { VolumeX } from "pixelarticons/react/VolumeX.js";
import { Zap } from "pixelarticons/react/Zap.js";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { RankInsignia } from "../../art/sprites";
import { LOFI_THEMES } from "../../lib/lofi";
import { rankFor } from "../../lib/rules";
import { streakDays, useProfile } from "../../state/profile";
import { useSettings } from "../../state/settings";
import { IconButton } from "./ArcadeButton";
import { Tooltip } from "./Overlays";
import { XpBar } from "./Progression";

// Game shell (6A.6): left icon rail, top bar with rank/XP/streak/mute/engine light, dispatch ticker.

const NAV = [
  { to: "/", label: "Case Board", icon: <Folder />, end: true },
  { to: "/investigate", label: "Investigation", icon: <Search /> },
  { to: "/forge", label: "Forge", icon: <Zap /> },
  { to: "/progress", label: "Progress", icon: <Trophy /> },
];

function RailLink({ to, label, icon, end }: { to: string; label: string; icon: ReactNode; end?: boolean }) {
  return (
    <Tooltip label={label}>
      <NavLink
        to={to}
        end={end}
        aria-label={label}
        className={({ isActive }) =>
          [
            "flex h-16 w-20 items-center justify-center border-y-[3px] border-transparent transition-colors [&>svg]:size-8",
            isActive ? "border-line bg-amber text-line" : "text-paper hover:bg-navy-2 hover:text-amber",
          ].join(" ")
        }
      >
        {icon}
      </NavLink>
    </Tooltip>
  );
}

export function NavRail() {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-40 flex h-screen w-20 shrink-0 flex-col self-start border-r-[3px] border-line bg-navy"
    >
      <NavLink
        to="/"
        aria-label="DejaBug home"
        className="flex h-20 items-center justify-center border-b-[3px] border-line"
      >
        <span className="font-display text-2xl leading-none text-amber">
          D<span className="text-stamp">B</span>
        </span>
      </NavLink>
      <div className="flex flex-1 flex-col py-3">
        {NAV.map((n) => (
          <RailLink key={n.to} {...n} />
        ))}
      </div>
      <div className="pb-3">
        <RailLink to="/settings" label="Settings" icon={<Sliders />} />
      </div>
    </nav>
  );
}

export type EngineStatus = "connected" | "offline" | "showcase";

export function TopBar({ title, engine }: { title: ReactNode; engine: EngineStatus }) {
  const profile = useProfile((s) => s.profile);
  const soundOn = useSettings((s) => s.soundOn);
  const toggleSound = useSettings((s) => s.toggleSound);
  const musicOn = useSettings((s) => s.musicOn);
  const toggleMusic = useSettings((s) => s.toggleMusic);
  const themeId = useSettings((s) => s.musicTheme);
  const musicTheme = LOFI_THEMES.find((t) => t.id === themeId)?.name ?? "Lofi";
  const { rank, next } = rankFor(profile.xp);
  const streak = streakDays(profile.solves);
  const light = { connected: "bg-pass", offline: "bg-stamp", showcase: "bg-amber" }[engine];
  const engineLabel = { connected: "Engine connected", offline: "Engine offline", showcase: "Showcase mode" }[
    engine
  ];

  return (
    <header className="flex flex-wrap items-center gap-4 px-6 py-3 sm:px-8">
      <div className="min-w-0 flex-1">{title}</div>
      <div className="flex items-center gap-3 rounded-[2px] border-[3px] border-line bg-navy px-3 py-2 shadow-hard">
        <RankInsignia rank={rank.id} size={36} />
        <div className="w-44">
          <div className="mb-1 flex justify-between font-display text-[11px] uppercase">
            <span className="text-amber">{rank.name}</span>
            <span className="tabular text-muted">
              {next ? `${next.minXp - profile.xp} to go` : "Max rank"}
            </span>
          </div>
          <XpBar
            value={profile.xp - rank.minXp}
            max={(next?.minXp ?? profile.xp) - rank.minXp || 1}
            label={`${profile.xp.toLocaleString()} XP`}
            height={18}
          />
        </div>
        <div
          className="flex items-center gap-1 border-l-2 border-navy-2 pl-3 font-display text-sm text-amber"
          title={`${streak}-day streak`}
        >
          <Fire className="size-5" />
          <span className="tabular">{streak}</span>
        </div>
      </div>
      <IconButton
        label={musicOn ? `Pause lofi radio (${musicTheme})` : `Play lofi radio (${musicTheme})`}
        onClick={toggleMusic}
        aria-pressed={musicOn}
        className="aria-pressed:bg-amber aria-pressed:text-line"
      >
        <Music />
      </IconButton>
      <IconButton label={soundOn ? "Mute sound effects" : "Unmute sound effects"} onClick={toggleSound}>
        {soundOn ? <Volume3 /> : <VolumeX />}
      </IconButton>
      <span
        className="flex items-center gap-2 font-display text-[11px] uppercase text-muted"
        title={engineLabel}
      >
        <span className={`size-3 border-2 border-line ${light}`} aria-hidden />
        <span className="sr-only sm:not-sr-only">{engineLabel}</span>
      </span>
    </header>
  );
}

/** One-line dispatch ticker with rotating lessons from solved cases (6A.6). */
export function DispatchTicker({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % lines.length), 7000);
    return () => window.clearInterval(id);
  }, [lines.length]);
  if (!lines.length) return null;
  return (
    <div className="flex min-w-0 items-center gap-3 border-b-[3px] border-line bg-line px-6 py-1.5 font-mono text-xs text-muted sm:px-8">
      <span className="font-display text-[10px] uppercase text-amber">Dispatch</span>
      <span className="min-w-0 truncate" aria-live="polite">
        {lines[i % lines.length]}
      </span>
    </div>
  );
}
