import { motion } from "framer-motion";
import { Lock } from "pixelarticons/react/Lock.js";
import type { PublicCase } from "../../api/client";
import { CorkPin, DifficultyPip } from "../../art/sprites";
import { baseXp } from "../../lib/rules";
import { useReducedMotion } from "../../state/settings";
import { Stamp } from "./Stamp";

// A pinned manila case folder (6A.7 W1). Four states: locked, available, active, solved.

export type FolderState = "locked" | "available" | "active" | "solved";

/** Stable tilt between -2 and 2 degrees, seeded by case id. */
export function tiltFor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 401) / 100 - 2;
}

export function coldLabel(days: number): string {
  if (days < 1) return "Fixed the same day";
  if (days >= 365) return `Cold for ${(days / 365).toFixed(1)} years`;
  return `Cold for ${days.toLocaleString()} ${days === 1 ? "day" : "days"}`;
}

export function CaseFolder({
  c,
  state,
  lockedReason,
  footnote,
  onOpen,
}: {
  c: PublicCase;
  state: FolderState;
  lockedReason?: string;
  footnote?: string;
  onOpen?: () => void;
}) {
  const reduced = useReducedMotion();
  const tilt = tiltFor(c.id);
  const locked = state === "locked";
  return (
    <motion.button
      type="button"
      onClick={locked ? undefined : onOpen}
      aria-disabled={locked}
      aria-label={`${c.brief.codename}, ${c.brief.precinct}, difficulty ${c.brief.difficulty}, ${state}`}
      className={[
        "group relative block w-full text-left outline-offset-4",
        locked ? "cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
      style={{ rotate: `${tilt}deg` }}
      whileHover={locked || reduced ? undefined : { y: -4, rotate: tilt * 0.4 }}
      transition={{ duration: 0.15 }}
    >
      {/* Folder tab with the precinct name. */}
      <span
        className={[
          "relative z-10 ml-3 inline-block rounded-t-[3px] border-[3px] border-b-0 border-line px-3 pt-1 pb-0.5",
          "font-display text-[10px] uppercase tracking-wider",
          locked ? "bg-navy-2 text-muted" : "bg-manila-deep text-text-dark",
        ].join(" ")}
      >
        {c.brief.precinct}
      </span>
      <span
        className={[
          "relative -mt-[3px] flex min-h-44 flex-col gap-2 rounded-[2px] border-[3px] border-line p-4 shadow-hard",
          locked ? "bg-navy text-muted saturate-0" : "bg-manila text-text-dark",
          state === "active" ? "outline-4 outline-amber [outline-style:solid]" : "",
        ].join(" ")}
      >
        <span className="absolute -top-3 right-5">
          <CorkPin size={20} />
        </span>
        <span className="font-display text-lg uppercase leading-tight">{c.brief.codename}</span>
        <span className="flex items-center gap-1" aria-hidden>
          {[1, 2, 3].map((n) => (
            <DifficultyPip key={n} on={n <= c.brief.difficulty} size={26} />
          ))}
        </span>
        <span className="mt-auto flex flex-wrap items-center gap-2">
          <Stamp size="sm" tone={locked ? "muted" : "stamp"} rotate={-3}>
            {coldLabel(c.bugAgeDays)}
          </Stamp>
          <span className="rounded-[2px] border-2 border-line bg-amber px-1.5 py-0.5 font-display text-[11px] text-line">
            +{baseXp(c.brief.difficulty)} XP
          </span>
        </span>
        {footnote ? <span className="font-mono text-[11px] opacity-70">{footnote}</span> : null}

        {state === "active" ? (
          <span className="absolute -right-2 top-8 rotate-6 border-[3px] border-line bg-amber px-2 py-0.5 font-display text-[10px] text-line shadow-hard-sm">
            In progress
          </span>
        ) : null}
        {state === "solved" ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Stamp size="lg" rotate={-12}>
              Case closed
            </Stamp>
          </span>
        ) : null}
        {locked ? (
          <span className="pointer-events-none absolute inset-x-[-6px] top-1/2 flex -translate-y-1/2 -rotate-6 items-center justify-center gap-2 border-y-[3px] border-line bg-amber py-1 font-display text-[11px] uppercase text-line">
            <Lock className="size-4" />
            {lockedReason ?? "Locked"}
          </span>
        ) : null}
      </span>
    </motion.button>
  );
}
