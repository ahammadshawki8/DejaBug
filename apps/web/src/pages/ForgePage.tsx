import { AnimatePresence, motion } from "framer-motion";
import { Zap } from "pixelarticons/react/Zap.js";
import { useEffect, useMemo, useReducer, useState } from "react";
import { api, subscribeForge } from "../api/client";
import {
  ArcadeButton,
  DarkPanel,
  FunnelCounter,
  PaperPanel,
  Terminal,
  WorkerLane,
  useToasts,
} from "../components/game";
import { initial, reduce } from "../lib/forgeView";
import { playSound } from "../lib/sound";
import { useGame } from "../state/game";
import { useReducedMotion, useSettings } from "../state/settings";
import { usePageTitle } from "./pageTitle";

// Forge Console (PROJECT.md 6A.7 W6, T7.0-T7.1): run mine -> certify -> brief on any repository and
// watch the parallel workers live over SSE. Certified cases land in the Evidence Locker.

const REASONS: Record<string, string> = {
  build: "does not compile before the fix",
  "no-fail": "test already passed before the fix",
  flaky: "flaky: failed only sometimes",
  "no-pass": "still failing after the fix",
  timeout: "process hung and was killed",
  brief: "no spoiler-free brief",
};

export function ForgePage() {
  usePageTitle("Forge", <Zap />);
  const reduced = useReducedMotion();
  const push = useToasts((s) => s.push);
  const { repos, loadRepos, loadCases } = useGame();
  const settingsRepo = useSettings((s) => s.repo);
  const [target, setTarget] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [limit, setLimit] = useState(8);
  const [workers, setWorkers] = useState(4);
  const [view, dispatch] = useReducer(reduce, 4, initial);

  const defaultRepo = repos.find((r) => r.default);
  const selected = target || settingsRepo || defaultRepo?.name || "";
  const selectedRepo = repos.find((r) => r.name === selected);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  // Current funnel for the selected repository.
  useEffect(() => {
    if (!selected) return;
    api
      .funnel(selected === defaultRepo?.name ? undefined : selected)
      .then((f) => f && dispatch({ type: "event", e: { type: "funnel", funnel: f } }))
      .catch(() => undefined);
  }, [selected, defaultRepo?.name]);

  // Live events: replays the current run's history on connect, so reloading the page is safe.
  useEffect(() => {
    const stop = subscribeForge((e) => {
      dispatch({ type: "event", e });
      if (e.type === "briefed" && e.ok) playSound("stamp");
      if (e.type === "done") {
        void loadRepos();
        void loadCases(settingsRepo, true);
      }
    });
    api
      .forgeStatus()
      .then(
        (s) =>
          s.running &&
          dispatch({ type: "event", e: { type: "log", message: `Forge in progress for ${s.repo}.` } }),
      )
      .catch(() => undefined);
    return stop;
  }, [loadRepos, loadCases, settingsRepo]);

  const start = async () => {
    const repo = custom.trim() || (selected === defaultRepo?.name ? undefined : selected);
    dispatch({ type: "reset", workers });
    try {
      const res = await api.startForge({ repo, limit, concurrency: workers });
      push(`Forging ${limit} candidates from ${res.repo}.`, "info");
    } catch (e) {
      push((e as Error).message, "error");
      dispatch({ type: "event", e: { type: "done" } });
    }
  };

  const f = view.funnel;
  const steps = useMemo(
    () => [
      { label: "Fix commits", value: f?.fixLikeCommits ?? 0 },
      { label: "Candidates", value: f?.candidates ?? 0, tone: "amber" as const },
      { label: "Certified", value: f?.byStatus.certified ?? 0, tone: "pass" as const },
    ],
    [f],
  );

  return (
    <div className="flex max-w-7xl flex-col gap-6 py-4">
      <DarkPanel className="flex flex-wrap items-end gap-5 p-5">
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] uppercase text-muted">Repository</span>
          <select
            value={selected}
            onChange={(e) => {
              setTarget(e.target.value);
              setCustom("");
            }}
            className="border-[3px] border-line bg-paper px-3 py-2 font-display text-xs uppercase text-text-dark shadow-hard-sm"
          >
            {repos.map((r) => (
              <option key={r.name} value={r.name}>
                {r.slug}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-60 flex-1 flex-col gap-1">
          <span className="font-display text-[11px] uppercase text-muted">
            Or open a new precinct (any GitHub repo)
          </span>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="owner/name, e.g. IBM/fp-go"
            className="border-[3px] border-line bg-paper px-3 py-2 font-mono text-sm text-text-dark shadow-hard-sm placeholder:text-text-dark/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] uppercase text-muted">Candidates</span>
          <input
            type="number"
            min={1}
            max={40}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
            className="w-24 border-[3px] border-line bg-paper px-3 py-2 font-mono text-sm text-text-dark shadow-hard-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] uppercase text-muted">Workers</span>
          <input
            type="number"
            min={1}
            max={8}
            value={workers}
            onChange={(e) => setWorkers(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
            className="w-20 border-[3px] border-line bg-paper px-3 py-2 font-mono text-sm text-text-dark shadow-hard-sm"
          />
        </label>
        <ArcadeButton size="lg" icon={<Zap />} onClick={() => void start()} disabled={view.running}>
          {view.running ? "Forging..." : `Forge ${limit} cases`}
        </ArcadeButton>
      </DarkPanel>

      <FunnelCounter steps={steps} />
      {selectedRepo?.language === "python" && !custom ? (
        <p className="text-xs text-muted">
          Python precincts run tests with the virtualenv at workspace/.venvs/{selectedRepo.name}.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <section aria-label="Worker lanes" className="flex flex-col gap-3">
          {view.lanes.map((l, i) => (
            <WorkerLane key={i} index={i} lane={l} />
          ))}
          <Terminal
            title="forge.log"
            tone={view.running ? "running" : "idle"}
            lines={view.log.length ? view.log : ["Press Forge to mine, certify and brief real bug fixes."]}
            maxHeight={160}
            wrap
          />
        </section>

        <aside className="flex flex-col gap-4">
          <PaperPanel
            tone="manila"
            title={`Evidence locker (${view.locker.length})`}
            className="overflow-hidden"
          >
            <ul className="flex max-h-72 flex-col gap-2 overflow-auto p-3">
              <AnimatePresence initial={false}>
                {view.locker.map((x) => (
                  <motion.li
                    key={x.sha}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: -16, rotate: -3 }}
                    animate={{ opacity: 1, y: 0, rotate: 0 }}
                    className="rounded-[2px] border-[3px] border-line bg-paper px-3 py-2 shadow-hard-sm"
                  >
                    <div className="font-display text-xs uppercase">{x.codename}</div>
                    <div className="font-mono text-[11px] text-text-dark/60">
                      {x.sha.slice(0, 7)} certified
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
              {!view.locker.length ? <li className="font-typewriter text-sm">No new cases yet.</li> : null}
            </ul>
          </PaperPanel>
          <DarkPanel title={`Discard bin (${view.discard.length})`}>
            <ul className="flex max-h-60 flex-col gap-1.5 overflow-auto p-3 text-xs">
              {view.discard.map((x) => (
                <li key={`${x.sha}-${x.reason}`} className="flex items-start gap-2">
                  <span className="shrink-0 border-2 border-line bg-stamp px-1 font-display text-[9px] uppercase text-paper">
                    {x.reason}
                  </span>
                  <span className="min-w-0 text-muted">
                    <span className="font-mono text-paper">{x.sha.slice(0, 7)}</span>{" "}
                    {REASONS[x.reason] ?? x.reason}
                  </span>
                </li>
              ))}
              {!view.discard.length ? <li className="text-muted">Nothing rejected yet.</li> : null}
            </ul>
          </DarkPanel>
        </aside>
      </div>
    </div>
  );
}
