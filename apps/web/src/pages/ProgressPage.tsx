import { Trophy } from "pixelarticons/react/Trophy.js";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RankInsignia } from "../art/sprites";
import {
  ArcadeButton,
  BadgeCard,
  DarkPanel,
  MasteryRing,
  Modal,
  PaperPanel,
  StreakCalendar,
  XpBar,
} from "../components/game";
import { BADGES } from "../lib/badges";
import { formatDuration } from "../lib/format";
import { RANKS, rankFor } from "../lib/rules";
import { useGame } from "../state/game";
import { streakDays, useProfile } from "../state/profile";
import { usePageTitle } from "./pageTitle";

// Progress (PROJECT.md 6A.7 W5): rank ladder, XP, badges, precinct mastery, streak, closed files.

export function ProgressPage() {
  usePageTitle("Progress", <Trophy />);
  const profile = useProfile((s) => s.profile);
  const cases = useGame((s) => s.cases);
  const [hallOpen, setHallOpen] = useState(false);
  const { rank, next } = rankFor(profile.xp);
  const rankIndex = RANKS.findIndex((r) => r.id === rank.id);
  const repoSlug = cases[0]?.repo;

  const precincts = useMemo(() => {
    const map = new Map<string, { total: number; solved: number }>();
    for (const c of cases) {
      const e = map.get(c.brief.precinct) ?? { total: 0, solved: 0 };
      e.total++;
      if (profile.solves.some((s) => s.caseId === c.id && s.repo === c.repo)) e.solved++;
      map.set(c.brief.precinct, e);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [cases, profile.solves]);

  const solveDays = useMemo(
    () => new Set(profile.solves.map((s) => s.solvedAt.slice(0, 10))),
    [profile.solves],
  );
  const closed = useMemo(
    () =>
      [...profile.solves]
        .sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
        .map((s) => ({ s, c: cases.find((c) => c.id === s.caseId && c.repo === s.repo) })),
    [profile.solves, cases],
  );
  // Hall of fame: your fastest closes, measured against how long the original team needed.
  const hall = useMemo(
    () =>
      closed
        .filter((x) => x.c?.original.daysOpen)
        .map((x) => ({ ...x, factor: ((x.c?.original.daysOpen ?? 0) * 86400) / Math.max(1, x.s.seconds) }))
        .sort((a, b) => b.factor - a.factor)
        .slice(0, 10),
    [closed],
  );

  return (
    <div className="flex max-w-6xl flex-col gap-6 py-4">
      <DarkPanel className="grid items-center gap-8 p-6 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <RankInsignia rank={rank.id} size={120} />
          <div className="font-display text-xl uppercase text-amber">{rank.name}</div>
        </div>
        <div className="flex flex-col gap-5">
          {/* The rank ladder: five stations on a path. */}
          <ol className="flex items-center" aria-label="Rank ladder">
            {RANKS.map((r, i) => (
              <li key={r.id} className="flex flex-1 items-center last:flex-none">
                <div
                  className={`flex flex-col items-center gap-1 ${i <= rankIndex ? "" : "opacity-40 grayscale"}`}
                  title={`${r.name}: ${r.minXp} XP`}
                >
                  <RankInsignia rank={r.id} size={40} />
                  <span className="font-display text-[10px] uppercase">{r.name}</span>
                </div>
                {i < RANKS.length - 1 ? (
                  <span
                    className={`mx-2 h-1.5 flex-1 border-y-2 border-line ${i < rankIndex ? "bg-amber" : "bg-navy-2"}`}
                  />
                ) : null}
              </li>
            ))}
          </ol>
          <div>
            <div className="mb-1 flex justify-between font-display text-[11px] uppercase">
              <span>{profile.xp.toLocaleString()} XP</span>
              <span className="text-muted">
                {next ? `${next.minXp - profile.xp} to ${next.name}` : "Top rank"}
              </span>
            </div>
            <XpBar
              value={profile.xp - rank.minXp}
              max={(next?.minXp ?? profile.xp) - rank.minXp || 1}
              label={next ? `${profile.xp - rank.minXp} / ${next.minXp - rank.minXp}` : "Max"}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <ArcadeButton tone="amber" size="sm" onClick={() => setHallOpen(true)} disabled={!hall.length}>
              Hall of fame
            </ArcadeButton>
          </div>
        </div>
      </DarkPanel>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-sm uppercase text-amber">
          Badges {profile.badges.length}/{BADGES.length}
        </h2>
        <div className="flex flex-wrap gap-4">
          {BADGES.map((b) => {
            const has = profile.badges.includes(b.id);
            return (
              <BadgeCard key={b.id} badge={b.id} name={b.name} description={b.description} locked={!has} />
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <DarkPanel title={`Precinct mastery${repoSlug ? ` (${repoSlug})` : ""}`} className="p-0">
          <div className="flex flex-wrap gap-6 p-5">
            {precincts.length ? (
              precincts.map(([name, e]) => (
                <MasteryRing key={name} label={name} solved={e.solved} total={e.total} />
              ))
            ) : (
              <p className="text-sm text-muted">No cases loaded yet.</p>
            )}
          </div>
        </DarkPanel>
        <DarkPanel title={`Streak: ${streakDays(profile.solves)} days`} className="p-0">
          <div className="p-5">
            <StreakCalendar days={35} solvedDates={solveDays} />
          </div>
        </DarkPanel>
      </div>

      <PaperPanel tone="manila" title="Closed files" className="overflow-hidden">
        {closed.length ? (
          <table className="w-full text-left text-sm">
            <thead className="font-display text-[11px] uppercase">
              <tr className="border-b-[3px] border-line">
                <th className="px-4 py-2">Case</th>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Hints</th>
                <th className="px-4 py-2">XP</th>
                <th className="px-4 py-2">Closed</th>
              </tr>
            </thead>
            <tbody>
              {closed.map(({ s, c }) => (
                <tr key={`${s.repo}/${s.caseId}`} className="border-b-2 border-line/15 last:border-b-0">
                  <td className="px-4 py-2">
                    <Link
                      to={`/case/${s.caseId}/debrief`}
                      className="font-display text-xs uppercase hover:text-stamp"
                    >
                      {c?.brief.codename ?? s.caseId}
                    </Link>
                  </td>
                  <td className="tabular px-4 py-2 font-mono">{formatDuration(s.seconds)}</td>
                  <td className="tabular px-4 py-2 font-mono">{s.hints}</td>
                  <td className="tabular px-4 py-2 font-mono">+{s.xp}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.solvedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-5 font-typewriter">The drawer is empty. Close your first case from the board.</p>
        )}
      </PaperPanel>

      <Modal open={hallOpen} onClose={() => setHallOpen(false)} title="Hall of fame">
        <ol className="flex flex-col gap-2">
          {hall.map(({ s, c, factor }, i) => (
            <li
              key={`${s.repo}/${s.caseId}`}
              className="flex items-baseline gap-3 font-display text-sm uppercase"
            >
              <span className="w-6 text-amber">{i + 1}.</span>
              <span className="flex-1 truncate">{c?.brief.codename}</span>
              <span className="tabular text-amber">
                {factor >= 10 ? Math.round(factor) : factor.toFixed(1)}x faster
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted">
          Your time against the days the original team spent from issue to merged fix.
        </p>
      </Modal>
    </div>
  );
}
