import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";
import { BadgeArt, type BadgeId } from "../../art/sprites";
import { useReducedMotion } from "../../state/settings";

// Progression widgets (6A.7 W5): XP bar, animated counter, mastery ring, badge card, streak calendar.

/** Pixel-bordered progress bar with the value printed inside (6A.1). */
export function XpBar({
  value,
  max,
  label,
  tone = "amber",
  height = 22,
}: {
  value: number;
  max: number;
  label?: string;
  tone?: "amber" | "pass" | "stamp";
  height?: number;
}) {
  const reduced = useReducedMotion();
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill = { amber: "bg-amber", pass: "bg-pass", stamp: "bg-stamp" }[tone];
  return (
    <div
      className="relative overflow-hidden rounded-[2px] border-[3px] border-line bg-navy"
      style={{ height }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <motion.div
        className={`h-full ${fill}`}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={reduced ? { duration: 0 } : { duration: 0.6, ease: "easeOut" }}
      />
      {label ? (
        <span className="tabular absolute inset-0 flex items-center justify-center font-display text-[11px] text-paper [text-shadow:1px_1px_0_var(--color-line)]">
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** Number that counts up to its value (XP gains, 6A.8). */
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.7, ease: "easeOut" });
    return () => controls.stop();
  }, [value, reduced, mv]);
  return <motion.span className={`tabular ${className}`}>{text}</motion.span>;
}

/** Segmented pixel ring: one segment per case in a precinct, filled when solved. */
export function MasteryRing({
  solved,
  total,
  label,
  size = 88,
}: {
  solved: number;
  total: number;
  label: string;
  size?: number;
}) {
  const segments = Math.max(1, total);
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const gap = segments > 1 ? 4 : 0;
  const seg = circumference / segments - gap;
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={`${label}: ${solved} of ${total} solved`}
      >
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-line)" strokeWidth="14" />
        {Array.from({ length: segments }, (_, i) => (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth="9"
            stroke={i < solved ? "var(--color-amber)" : "var(--color-navy-2)"}
            strokeDasharray={`${seg} ${circumference - seg}`}
            strokeDashoffset={-(i * (seg + gap))}
            transform="rotate(-90 50 50)"
            strokeLinecap="butt"
          />
        ))}
        <text
          x="50"
          y="56"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontSize="18"
          fill="var(--color-paper)"
        >
          {solved}/{total}
        </text>
      </svg>
      <figcaption className="font-display text-[11px] uppercase text-muted">{label}</figcaption>
    </figure>
  );
}

/** Collectible badge card (6A.1 NFT-style cards, 6A.7 W5). Locked badges are silhouettes. */
export function BadgeCard({
  badge,
  name,
  description,
  locked,
  highlight = false,
}: {
  badge: BadgeId;
  name: string;
  description: string;
  locked: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "flex w-36 flex-col items-center gap-2 rounded-[2px] border-[3px] border-line p-3 text-center shadow-hard",
        locked ? "bg-navy text-muted" : "bg-manila text-text-dark",
        highlight ? "ring-4 ring-amber" : "",
      ].join(" ")}
    >
      <div
        className={`flex size-16 items-center justify-center border-[3px] border-line ${locked ? "bg-ink" : "bg-paper"}`}
      >
        <BadgeArt badge={badge} locked={locked} size={44} />
      </div>
      <div className="font-display text-[11px] uppercase leading-tight">{locked ? "Locked" : name}</div>
      <div className="text-xs leading-snug">{description}</div>
    </div>
  );
}

/** Last N days as pixel squares; solved days are amber (6A.7 W5). */
export function StreakCalendar({ days, solvedDates }: { days: number; solvedDates: Set<string> }) {
  const today = new Date();
  const cells = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    return { key, on: solvedDates.has(key) };
  });
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1" role="img" aria-label="solve streak calendar">
      {cells.map((c) => (
        <span
          key={c.key}
          title={c.key}
          className={`size-3.5 border-2 border-line ${c.on ? "bg-amber" : "bg-navy-2"}`}
        />
      ))}
    </div>
  );
}
