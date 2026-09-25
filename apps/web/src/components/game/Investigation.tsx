import { AnimatePresence, motion } from "framer-motion";
import { Lock } from "pixelarticons/react/Lock.js";
import { Mail } from "pixelarticons/react/Mail.js";
import { MailOpen } from "pixelarticons/react/MailOpen.js";
import type { ReactNode } from "react";
import { formatDuration } from "../../lib/format";
import { useReducedMotion } from "../../state/settings";
import { PaperClip } from "../../art/sprites";

// Investigation widgets (6A.7 W3/W4): timer, hint ladder, versus panel.

export function Timer({ seconds, parSeconds }: { seconds: number; parSeconds: number }) {
  const over = seconds > parSeconds;
  const pct = Math.min(100, (seconds / Math.max(1, parSeconds)) * 100);
  return (
    <div
      className="flex flex-col gap-2"
      aria-label={`elapsed ${formatDuration(seconds)}, par ${formatDuration(parSeconds)}`}
    >
      <div
        className={`tabular font-mono text-6xl font-semibold leading-none sm:text-7xl ${over ? "text-stamp" : "text-paper"}`}
      >
        {formatDuration(seconds)}
      </div>
      <div className="relative h-3 border-2 border-line bg-navy-2">
        <div className={`h-full ${over ? "bg-stamp" : "bg-amber"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="font-display text-[11px] uppercase text-muted">
        Par {formatDuration(parSeconds)} {over ? "(over par)" : ""}
      </div>
    </div>
  );
}

/** Three sealed envelopes. Opening one costs XP and needs a confirmation (6A.7 W3). */
export function HintLadder({
  hints,
  total,
  cost,
  confirming,
  onRequest,
  onConfirm,
  onCancel,
  disabled,
}: {
  hints: string[];
  total: number;
  cost: number;
  confirming?: number;
  onRequest: (n: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const reduced = useReducedMotion();
  const next = hints.length + 1;
  return (
    <ol className="flex flex-col gap-3" aria-label="hint ladder">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const open = n <= hints.length;
        const isNext = n === next;
        return (
          <li key={n}>
            <AnimatePresence mode="wait" initial={false}>
              {open ? (
                <motion.div
                  key="open"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8, rotate: -1 }}
                  animate={{ opacity: 1, y: 0, rotate: n % 2 ? -0.6 : 0.6 }}
                  className="relative rounded-[2px] border-[3px] border-line bg-paper px-4 pt-4 pb-3 text-text-dark shadow-hard-sm"
                >
                  <span className="absolute -top-3 left-4">
                    <PaperClip size={22} />
                  </span>
                  <div className="mb-1 flex items-center gap-2 font-display text-[11px] uppercase text-stamp">
                    <MailOpen className="size-4" /> Hint {n}
                  </div>
                  <p className="font-typewriter text-sm leading-relaxed">{hints[i]}</p>
                </motion.div>
              ) : confirming === n ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-wrap items-center gap-3 rounded-[2px] border-[3px] border-stamp bg-navy px-4 py-3"
                >
                  <span className="flex-1 text-sm">
                    Open hint {n} for <strong className="text-stamp">-{cost} XP</strong>?
                  </span>
                  <button
                    type="button"
                    onClick={onConfirm}
                    className="border-[3px] border-line bg-stamp px-3 py-1 font-display text-xs uppercase text-paper shadow-hard-sm"
                  >
                    Open it
                  </button>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="px-2 py-1 font-display text-xs uppercase text-muted"
                  >
                    Keep it sealed
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="sealed"
                  type="button"
                  disabled={!isNext || disabled}
                  onClick={() => onRequest(n)}
                  className={[
                    "flex w-full items-center gap-3 rounded-[2px] border-[3px] border-line px-4 py-3 text-left shadow-hard-sm",
                    isNext && !disabled
                      ? "bg-manila text-text-dark hover:bg-manila-deep"
                      : "bg-navy-2 text-muted",
                  ].join(" ")}
                >
                  {isNext && !disabled ? (
                    <Mail className="size-6 shrink-0" />
                  ) : (
                    <Lock className="size-6 shrink-0" />
                  )}
                  <span className="flex-1 font-display text-xs uppercase">Sealed hint {n}</span>
                  <span className="font-display text-xs text-stamp">-{cost} XP</span>
                </motion.button>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ol>
  );
}

export interface VersusRow {
  label: string;
  you: ReactNode;
  them: ReactNode;
}

/** Fighting-game style comparison: your investigation vs the original team (6A.7 W4). */
export function VersusPanel({ rows }: { rows: VersusRow[] }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] overflow-hidden rounded-[2px] border-[3px] border-line shadow-hard">
      <div className="bg-amber px-4 py-2 text-center font-display text-sm uppercase text-line">
        Your investigation
      </div>
      <div className="flex items-center bg-line px-3 font-display text-xl text-paper">VS</div>
      <div className="bg-navy-2 px-4 py-2 text-center font-display text-sm uppercase text-paper">
        Original team
      </div>
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <div className="border-t-[3px] border-line bg-paper px-4 py-3 text-center">
            <div className="tabular font-display text-2xl text-text-dark">{r.you}</div>
          </div>
          <div className="flex items-center justify-center border-t-[3px] border-line bg-line px-2 text-center font-display text-[10px] uppercase text-muted">
            {r.label}
          </div>
          <div className="border-t-[3px] border-line bg-navy px-4 py-3 text-center">
            <div className="tabular font-display text-2xl text-paper">{r.them}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
