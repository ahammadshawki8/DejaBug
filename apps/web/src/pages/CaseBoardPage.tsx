import { motion } from "framer-motion";
import { Check } from "pixelarticons/react/Check.js";
import { Clock } from "pixelarticons/react/Clock.js";
import { Folder } from "pixelarticons/react/Folder.js";
import { Reload } from "pixelarticons/react/Reload.js";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PublicCase } from "../api/client";
import {
  ArcadeButton,
  CaseFolder,
  DossierTabs,
  PaperPanel,
  Stamp,
  StatTile,
  type FolderState,
} from "../components/game";
import { formatDuration } from "../lib/format";
import { rankFor } from "../lib/rules";
import { useGame } from "../state/game";
import { useProfile } from "../state/profile";
import { useReducedMotion, useSettings } from "../state/settings";
import { usePageTitle } from "./pageTitle";

// Case Board (PROJECT.md 6A.7 W1): the hero screen. Cork-surface folder grid, stat tiles,
// precinct tabs, red-string hover links, and themed loading/empty/error states.

const DETECTIVE_XP = 300;

/** Tab labels from precinct slugs: "consumer-group" becomes "Consumer group". */
function precinctLabel(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Center of a rect relative to a reference rect. */
function centerOf(el: HTMLElement, board: HTMLElement): { x: number; y: number } {
  const er = el.getBoundingClientRect();
  const br = board.getBoundingClientRect();
  return {
    x: er.left - br.left + er.width / 2,
    y: er.top - br.top + er.height / 2,
  };
}

export function CaseBoardPage() {
  usePageTitle("Case Board", <Folder />);

  const navigate = useNavigate();
  const reduced = useReducedMotion();

  // State slices
  const cases = useGame((s) => s.cases);
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);
  const loadCases = useGame((s) => s.loadCases);
  const repo = useSettings((s) => s.repo);
  const activeCaseId = useSettings((s) => s.activeCaseId);
  const profile = useProfile((s) => s.profile);

  const [precinct, setPrecinct] = useState<string>("all");

  const boardRef = useRef<HTMLDivElement>(null);
  const folderRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // --- Derived data ---

  const repoSlug = cases[0]?.repo;
  const solveMap = useMemo(
    () => new Map(profile.solves.filter((s) => s.repo === repoSlug).map((s) => [s.caseId, s])),
    [profile.solves, repoSlug],
  );

  const openCount = useMemo(() => cases.filter((c) => !solveMap.has(c.id)).length, [cases, solveMap]);

  const closedCount = solveMap.size;

  const bestSeconds = useMemo(() => {
    if (profile.solves.length === 0) return undefined;
    return Math.min(...profile.solves.map((s) => s.seconds));
  }, [profile.solves]);

  const { rank } = rankFor(profile.xp);

  const folderState = (c: PublicCase): FolderState => {
    if (solveMap.has(c.id)) return "solved";
    if (c.id === activeCaseId) return "active";
    if (c.brief.difficulty === 3 && profile.xp < DETECTIVE_XP) return "locked";
    return "available";
  };

  const footnoteFor = (c: PublicCase): string | undefined => {
    const s = solveMap.get(c.id);
    return s ? `Best ${formatDuration(s.seconds)}` : undefined;
  };

  // Precinct tabs come from the data, so any repository's areas appear (PROJECT.md Rule 10).
  const tabsWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cases) {
      const key = c.brief.precinct.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const precincts = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
    return [
      { id: "all", label: "All", count: cases.length },
      ...precincts.map(([id, count]) => ({ id, label: precinctLabel(id), count })),
    ];
  }, [cases]);

  const filteredCases = useMemo(
    () => (precinct === "all" ? cases : cases.filter((c) => c.brief.precinct.toLowerCase() === precinct)),
    [cases, precinct],
  );

  // --- Red-string SVG lines ---
  // Stored as state; updated from mouse-event handlers (which can freely read refs).
  const [stringLines, setStringLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  const computeLines = (caseId: string) => {
    if (reduced) return [];
    const board = boardRef.current;
    const hoveredEl = folderRefs.current.get(caseId);
    if (!board || !hoveredEl) return [];
    const hoveredCase = filteredCases.find((c) => c.id === caseId);
    if (!hoveredCase) return [];
    const hoveredPrecinct = hoveredCase.brief.precinct.toLowerCase();
    const from = centerOf(hoveredEl, board);
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const c of filteredCases) {
      if (c.id === caseId) continue;
      if (c.brief.precinct.toLowerCase() !== hoveredPrecinct) continue;
      const el = folderRefs.current.get(c.id);
      if (!el) continue;
      const to = centerOf(el, board);
      lines.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    }
    return lines;
  };

  // --- Loading state ---
  if (status === "idle" || status === "loading") {
    return (
      <div className="py-4">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="h-16 rounded-[2px] border-[3px] border-line bg-manila/40 shadow-hard"
              initial={{ opacity: 0.3 }}
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
        </div>
        <motion.div
          className="cork min-h-80 rounded-[2px] border-[3px] border-line shadow-hard"
          initial={{ opacity: 0.4 }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          aria-label="Pulling the files from the archive"
        />
      </div>
    );
  }

  // --- Error state ---
  if (status === "error") {
    return (
      <div className="py-4">
        <PaperPanel tone="paper" className="max-w-md p-8">
          <Stamp size="lg" rotate={-8}>
            Radio silence
          </Stamp>
          <p className="mt-6 font-typewriter text-text-dark">
            {error ?? "Could not reach HQ. Check the engine is running."}
          </p>
          <div className="mt-6">
            <ArcadeButton
              tone="amber"
              icon={<Reload className="size-4" />}
              onClick={() => void loadCases(repo, true)}
            >
              Retry
            </ArcadeButton>
          </div>
        </PaperPanel>
      </div>
    );
  }

  // --- Ready ---
  return (
    <div className="max-w-7xl py-4">
      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Open cases" value={openCount} tone="navy" icon={<Folder className="size-7" />} />
        <StatTile label="Closed" value={closedCount} tone="stamp" icon={<Check className="size-7" />} />
        <StatTile
          label="Best time"
          value={bestSeconds !== undefined ? formatDuration(bestSeconds) : "--"}
          tone="amber"
          icon={<Clock className="size-7" />}
        />
        <StatTile label="Rank" value={rank.name} tone="manila" />
      </div>

      {/* Precinct tabs + cork board */}
      <section aria-label="Case board">
        <DossierTabs
          label="Filter by precinct"
          active={precinct}
          onChange={setPrecinct}
          tabs={tabsWithCounts}
        />

        {filteredCases.length === 0 ? (
          /* Empty state */
          <div className="cork flex min-h-60 flex-col items-center justify-center gap-4 rounded-b-[2px] rounded-tr-[2px] border-[3px] border-t-0 border-line p-8 shadow-hard">
            <p className="font-display text-sm uppercase text-manila">No open cases. Fire up the Forge.</p>
            <ArcadeButton tone="amber" onClick={() => navigate("/forge")}>
              Go to Forge
            </ArcadeButton>
          </div>
        ) : (
          /* Cork board with folder grid */
          <div
            ref={boardRef}
            className="cork relative rounded-b-[2px] rounded-tr-[2px] border-[3px] border-t-0 border-line p-6 shadow-hard sm:p-8"
          >
            {/* Red-string SVG overlay */}
            {stringLines.length > 0 ? (
              <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
                {stringLines.map((l, i) => (
                  <line
                    key={i}
                    x1={l.x1}
                    y1={l.y1}
                    x2={l.x2}
                    y2={l.y2}
                    stroke="var(--color-stamp)"
                    strokeWidth="2"
                    opacity="0.7"
                    strokeLinecap="round"
                  />
                ))}
              </svg>
            ) : null}

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredCases.map((c) => {
                const state = folderState(c);
                return (
                  <div
                    key={c.id}
                    ref={(el) => {
                      if (el) folderRefs.current.set(c.id, el);
                      else folderRefs.current.delete(c.id);
                    }}
                    onMouseEnter={() => setStringLines(computeLines(c.id))}
                    onMouseLeave={() => setStringLines([])}
                    onFocus={() => setStringLines(computeLines(c.id))}
                    onBlur={() => setStringLines([])}
                  >
                    <CaseFolder
                      c={c}
                      state={state}
                      lockedReason={state === "locked" ? `Reach Detective` : undefined}
                      footnote={footnoteFor(c)}
                      onOpen={() => navigate(`/case/${c.id}`)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
