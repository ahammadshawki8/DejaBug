import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useReducedMotion } from "../../state/settings";
import { CountUp } from "./Progression";

// Forge Console widgets (6A.7 W6): funnel counters and parallel worker lanes.

export function FunnelCounter({
  steps,
}: {
  steps: { label: string; value: number; tone?: "navy" | "amber" | "pass" }[];
}) {
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <div
            className={[
              "min-w-40 rounded-[2px] border-[3px] border-line px-4 py-3 shadow-hard",
              s.tone === "pass"
                ? "bg-pass text-line"
                : s.tone === "amber"
                  ? "bg-amber text-line"
                  : "bg-navy-2 text-paper",
            ].join(" ")}
          >
            <div className="font-display text-[11px] uppercase opacity-80">{s.label}</div>
            <CountUp value={s.value} className="font-display text-4xl leading-tight" />
          </div>
          {i < steps.length - 1 ? (
            <span aria-hidden className="font-display text-2xl text-amber">
              &gt;
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export type LaneStage = "idle" | "mine" | "certify" | "brief";

export interface LaneState {
  sha?: string;
  subject?: string;
  stage: LaneStage;
  failLights: boolean[]; // one per fail-phase run: true when the run failed as required
  passLight?: boolean;
  writing?: boolean; // the brief writer is working
}

const STATIONS: { id: LaneStage; label: string }[] = [
  { id: "mine", label: "Mine" },
  { id: "certify", label: "Certify" },
  { id: "brief", label: "Brief" },
];

function Light({ on, tone }: { on?: boolean; tone: "pass" | "stamp" | "amber" }) {
  const color =
    on === undefined
      ? "bg-navy-2"
      : on
        ? { pass: "bg-pass", stamp: "bg-stamp", amber: "bg-amber" }[tone]
        : "bg-stamp";
  return <span className={`inline-block size-3 border-2 border-line ${color}`} />;
}

/** One conveyor belt: the current candidate chip moving through Mine, Certify, Brief. */
export function WorkerLane({ index, lane }: { index: number; lane: LaneState }) {
  const reduced = useReducedMotion();
  const stageIndex = STATIONS.findIndex((s) => s.id === lane.stage);
  return (
    <div className="grid grid-cols-[3rem_1fr] items-stretch overflow-hidden rounded-[2px] border-[3px] border-line bg-navy shadow-hard">
      <div className="flex items-center justify-center border-r-[3px] border-line bg-line font-display text-sm text-amber">
        W{index + 1}
      </div>
      <div className="relative grid grid-cols-3">
        {STATIONS.map((s, i) => (
          <div
            key={s.id}
            className={`flex min-h-20 flex-col border-r-2 border-dashed border-navy-2 px-3 pt-2 last:border-r-0 ${
              i === stageIndex ? "bg-navy-2" : ""
            }`}
          >
            {/* Top row: station name and its indicators. The bottom of the lane is the chip's track. */}
            <span className="flex items-center justify-between gap-2">
              <span className="font-display text-[10px] uppercase text-muted">{s.label}</span>
              {s.id === "certify" ? (
                <span className="flex items-center gap-1" aria-label="certification runs">
                  {[0, 1, 2].map((n) => (
                    <Light key={n} on={lane.failLights[n]} tone="stamp" />
                  ))}
                  <span className="mx-0.5 text-muted">|</span>
                  <Light on={lane.passLight} tone="pass" />
                </span>
              ) : s.id === "brief" && lane.stage === "brief" && lane.writing ? (
                <span className="animate-pulse font-mono text-[11px] text-amber">writing</span>
              ) : null}
            </span>
          </div>
        ))}
        {lane.sha ? (
          <motion.div
            className="absolute bottom-2 w-[31%] truncate rounded-[2px] border-2 border-line bg-manila px-2 py-1 font-mono text-[11px] text-text-dark shadow-hard-sm"
            initial={false}
            animate={{ left: `${Math.max(0, stageIndex) * 33.33 + 1}%` }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 22 }}
            title={lane.subject}
          >
            {lane.sha.slice(0, 7)} {lane.subject}
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

export function DossierTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: { id: T; label: ReactNode; count?: number }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap items-end gap-1">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={[
              "rounded-t-[3px] border-[3px] border-b-0 border-line px-3 font-display text-[11px] uppercase transition-[padding]",
              on
                ? "bg-manila pt-2 pb-2 text-text-dark"
                : "bg-navy-2 pt-1.5 pb-1 text-paper hover:bg-manila-deep hover:text-text-dark",
            ].join(" ")}
          >
            {t.label}
            {t.count !== undefined ? <span className="ml-1.5 opacity-60">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
