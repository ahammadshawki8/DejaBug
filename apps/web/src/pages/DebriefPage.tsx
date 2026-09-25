import confetti from "canvas-confetti";
import { Trophy } from "pixelarticons/react/Trophy.js";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, type CaseSession, type PublicCase, type Reveal } from "../api/client";
import { RankInsignia } from "../art/sprites";
import {
  ArcadeButton,
  CountUp,
  DarkPanel,
  Modal,
  PaperPanel,
  Stamp,
  VersusPanel,
  XpBar,
} from "../components/game";
import { DiffView } from "../components/game/DiffView";
import { formatDuration } from "../lib/format";
import { rankFor, scoreSolve } from "../lib/rules";
import { changedLines, formatDays, solveSeconds } from "../lib/solve";
import { useGame } from "../state/game";
import { useProfile } from "../state/profile";
import { useReducedMotion, useSettings } from "../state/settings";
import { usePageTitle } from "./pageTitle";

// Debrief (PROJECT.md 6A.7 W4): the reward screen, then "your investigation vs the original team".

export function DebriefPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const flags = (location.state ?? {}) as { rankUp?: boolean; firstSolve?: boolean };
  const repo = useSettings((s) => s.repo);
  const reduced = useReducedMotion();
  const profile = useProfile((s) => s.profile);
  const cases = useGame((s) => s.cases);
  const [c, setCase] = useState<PublicCase>();
  const [session, setSession] = useState<CaseSession>();
  const [reveal, setReveal] = useState<Reveal>();
  const [error, setError] = useState<string>();
  const [rankModal, setRankModal] = useState(Boolean(flags.rankUp));
  usePageTitle("Debrief", <Trophy />);

  useEffect(() => {
    let live = true;
    Promise.all([api.case(id, repo), api.reveal(id, repo)])
      .then(([d, r]) => {
        if (!live) return;
        setCase(d.case);
        setSession(r.session);
        setReveal(r.reveal);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id, repo]);

  // Confetti only for meaningful moments: the first solve ever, or a rank-up (6A.7 W4).
  useEffect(() => {
    if (reduced || !reveal || !(flags.firstSolve || flags.rankUp)) return;
    const t = window.setTimeout(
      () =>
        void confetti({
          particleCount: 120,
          spread: 75,
          origin: { y: 0.3 },
          colors: ["#FFB627", "#D7263D", "#F7F1E1", "#2FA84F"],
        }),
      350,
    );
    return () => window.clearTimeout(t);
  }, [reveal, reduced, flags.firstSolve, flags.rankUp]);

  const record = profile.solves.find((s) => s.caseId === id && s.repo === c?.repo);
  const solved = Boolean(session?.solvedAt);
  const seconds = session ? solveSeconds(session) : 0;
  const breakdown = useMemo(
    () =>
      c && session && solved
        ? scoreSolve(c.brief.difficulty, session.hintsRevealed, seconds, c.parSeconds)
        : undefined,
    [c, session, solved, seconds],
  );
  const { rank, next, progress } = rankFor(profile.xp);
  const nextCase = cases.find((x) => x.id !== id && !profile.solves.some((s) => s.caseId === x.id));

  if (error) {
    return (
      <PaperPanel tone="paper" className="mt-6 max-w-xl p-8">
        <Stamp size="lg">Sealed</Stamp>
        <p className="mt-6 font-typewriter">{error}</p>
        <Link
          to={`/case/${id}`}
          className="mt-4 inline-block font-display text-sm uppercase text-stamp underline"
        >
          Back to the case file
        </Link>
      </PaperPanel>
    );
  }
  if (!c || !session || !reveal) {
    return (
      <div className="mt-6 h-72 max-w-5xl animate-pulse rounded-[2px] border-[3px] border-line bg-navy" />
    );
  }

  const xpEarned = record?.xp ?? 0;
  return (
    <div className="flex max-w-6xl flex-col gap-8 py-4">
      {/* The reward moment */}
      <DarkPanel className="grid items-center gap-8 p-8 md:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-6">
          <div>
            <div className="font-display text-[11px] uppercase text-muted">{c.repo}</div>
            <h2 className="font-display text-2xl uppercase text-amber">{c.brief.codename}</h2>
          </div>
          <div className="flex flex-wrap gap-8">
            <div>
              <div className="font-display text-[11px] uppercase text-muted">XP earned</div>
              <CountUp value={xpEarned} className="font-display text-5xl text-amber" />
            </div>
            <div>
              <div className="font-display text-[11px] uppercase text-muted">Time</div>
              <div className="tabular font-mono text-5xl font-semibold">
                {solved ? formatDuration(seconds) : "--"}
              </div>
            </div>
            <div>
              <div className="font-display text-[11px] uppercase text-muted">Hints</div>
              <div className="tabular font-mono text-5xl font-semibold">{session.hintsRevealed}</div>
            </div>
          </div>
          {breakdown ? (
            <p className="font-mono text-xs text-muted">
              base {breakdown.base} - hints {breakdown.hintPenalty} + speed {breakdown.timeBonus}
              {breakdown.cleanMultiplier > 1 ? " x1.2 clean solve" : ""} = {breakdown.total} XP
            </p>
          ) : (
            <p className="font-mono text-xs text-muted">
              Case abandoned: no XP, but the original fix is yours to study.
            </p>
          )}
          <div className="flex items-center gap-4">
            <RankInsignia rank={rank.id} size={48} />
            <div className="flex-1">
              <div className="mb-1 flex justify-between font-display text-[11px] uppercase">
                <span className="text-amber">{rank.name}</span>
                <span className="text-muted">
                  {next ? `${next.minXp - profile.xp} XP to ${next.name}` : "Top rank"}
                </span>
              </div>
              <XpBar
                value={Math.round(progress * 1000)}
                max={1000}
                label={`${profile.xp.toLocaleString()} XP`}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-center">
          {solved ? (
            <Stamp slam size="xl" rotate={-10}>
              Case closed
            </Stamp>
          ) : (
            <Stamp slam size="lg" tone="muted" rotate={-6}>
              Case abandoned
            </Stamp>
          )}
        </div>
      </DarkPanel>

      <VersusPanel
        rows={[
          {
            label: "Time",
            you: solved ? formatDuration(seconds) : "gave up",
            them: formatDays(reveal.original.daysOpen),
          },
          { label: "Hints", you: session.hintsRevealed, them: "none" },
          {
            label: "Lines changed",
            you: changedLines(reveal.playerDiff),
            them: changedLines(reveal.fixDiff),
          },
          { label: "Discussion", you: "0 comments", them: `${reveal.original.comments ?? 0} comments` },
          { label: "Review rounds", you: "0", them: reveal.original.reviewRounds ?? 0 },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <PaperPanel tone="paper" title="Your changes" className="overflow-hidden">
          <DiffView diff={reveal.playerDiff} empty="You did not change any code in the playground." />
        </PaperPanel>
        <PaperPanel
          tone="paper"
          title={reveal.prNumber ? `The original fix (PR #${reveal.prNumber})` : "The original fix"}
          className="overflow-hidden"
        >
          <DiffView diff={reveal.fixDiff} />
        </PaperPanel>
      </div>

      <PaperPanel tone="manila" pinned className="p-6">
        <h3 className="font-display text-sm uppercase text-stamp">Lesson for the file</h3>
        <p className="mt-2 font-typewriter text-base leading-relaxed">{reveal.lesson}</p>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-display text-xs uppercase">All three hints</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 font-typewriter">
            {reveal.hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
        </details>
      </PaperPanel>

      <div className="flex flex-wrap gap-4">
        {nextCase ? (
          <ArcadeButton size="lg" onClick={() => navigate(`/case/${nextCase.id}`)}>
            Next case
          </ArcadeButton>
        ) : null}
        <ArcadeButton tone="paper" size="lg" onClick={() => navigate("/")}>
          Back to the board
        </ArcadeButton>
      </div>

      <Modal open={rankModal} onClose={() => setRankModal(false)} title="Promotion">
        <div className="flex items-center gap-5">
          <RankInsignia rank={rank.id} size={80} />
          <div>
            <p className="font-display text-xl uppercase text-amber">{rank.name}</p>
            <p className="mt-2 text-sm">
              The chief pinned a new badge on your coat. Harder cases are open on the board.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
