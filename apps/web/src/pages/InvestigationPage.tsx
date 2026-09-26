import { Play } from "pixelarticons/react/Play.js";
import { Search } from "pixelarticons/react/Search.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, type CaseSession, type PublicCase, type VerifyResult } from "../api/client";
import {
  ArcadeButton,
  DarkPanel,
  HintLadder,
  MentorPanel,
  Modal,
  PaperPanel,
  Stamp,
  Terminal,
  Timer,
  XpBar,
  useToasts,
  type TerminalTone,
} from "../components/game";
import { baseXp, remainingXp } from "../lib/rules";
import { awardBadges } from "../lib/badges";
import { applySolve } from "../lib/solve";
import { playSound } from "../lib/sound";
import { useGame } from "../state/game";
import { useProfile } from "../state/profile";
import { useSettings } from "../state/settings";
import { usePageTitle } from "./pageTitle";

// Investigation (PROJECT.md 6A.7 W3): live timer, objective, remaining XP, hint ladder, RUN TESTS.

const VERDICT: Record<VerifyResult["outcome"], string> = {
  pass: "VERIFIED. The suspect is in custody.",
  fail: "SUSPECT STILL AT LARGE. The tests still fail.",
  hang: "THE SUSPECT IS STALLING. A test hangs until the timeout: something never returns.",
  build: "THE EVIDENCE DOES NOT COMPILE. Fix the build error first.",
  notest: "NO TESTS RAN. Did a test get renamed or deleted?",
};

function useElapsed(startedAt?: string, stoppedAt?: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || stoppedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt, stoppedAt]);
  if (!startedAt) return 0;
  const end = stoppedAt ? Date.parse(stoppedAt) : now;
  return Math.max(0, Math.floor((end - Date.parse(startedAt)) / 1000));
}

export function InvestigationPage() {
  const params = useParams();
  const activeCaseId = useSettings((s) => s.activeCaseId);
  const id = params.id ?? activeCaseId;
  usePageTitle("Investigation", <Search />);

  if (!id) {
    return (
      <PaperPanel tone="manila" pinned className="mt-6 max-w-xl p-8">
        <p className="font-typewriter text-lg">No case on your desk.</p>
        <p className="mt-2 text-sm">
          Pick a folder from the case board and take the case to start an investigation.
        </p>
        <Link to="/" className="mt-4 inline-block font-display text-sm uppercase text-stamp underline">
          Open the case board
        </Link>
      </PaperPanel>
    );
  }
  return <Investigation key={id} id={id} />;
}

function Investigation({ id }: { id: string }) {
  const navigate = useNavigate();
  const repo = useSettings((s) => s.repo);
  const setActiveCase = useSettings((s) => s.setActiveCase);
  const push = useToasts((s) => s.push);
  const profile = useProfile((s) => s.profile);
  const saveProfile = useProfile((s) => s.save);
  const allCases = useGame((s) => s.cases);

  const [c, setCase] = useState<PublicCase>();
  const [session, setSession] = useState<CaseSession>();
  const [hints, setHints] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState<number>();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<VerifyResult>();
  const [shakeKey, setShakeKey] = useState(0);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([api.case(id, repo), api.session(id, repo)])
      .then(([d, s]) => {
        if (!live) return;
        setCase(d.case);
        setSession(s.session);
        setHints(s.hints);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id, repo]);

  const elapsed = useElapsed(session?.startedAt, session?.solvedAt ?? session?.gaveUpAt);
  const hintCost = c ? Math.round(baseXp(c.brief.difficulty) * 0.25) : 0;
  const maxXp = c ? Math.round(baseXp(c.brief.difficulty) * 1.8) : 1;
  const xpLeft = c ? remainingXp(c.brief.difficulty, hints.length, elapsed, c.parSeconds) : 0;

  const runTests = useCallback(async () => {
    if (!c || running) return;
    setRunning(true);
    setResult(undefined);
    try {
      const res = await api.verify(id, repo);
      setResult(res.result);
      setSession(res.session);
      if (res.result.pass && res.session.solvedAt) {
        playSound("pass");
        const outcome = applySolve(profile, c, res.session);
        const withBadges = awardBadges(
          outcome.profile,
          allCases.some((x) => x.id === c.id) ? allCases : [...allCases, c],
        );
        await saveProfile(withBadges.profile);
        setActiveCase(undefined);
        window.setTimeout(
          () =>
            navigate(`/case/${id}/debrief`, {
              state: {
                rankUp: outcome.rankUp,
                firstSolve: outcome.firstSolve,
                unlocked: withBadges.unlocked,
              },
            }),
          1400,
        );
      } else {
        playSound("fail");
        setShakeKey((k) => k + 1);
      }
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setRunning(false);
    }
  }, [c, running, id, repo, profile, allCases, saveProfile, setActiveCase, navigate, push]);

  const openHint = useCallback(async () => {
    if (confirming === undefined) return;
    try {
      const res = await api.hint(id, confirming, repo);
      playSound("hint");
      setHints((h) => [...h, res.hint]);
      setSession(res.session);
      push(`Hint ${res.n} opened: -${hintCost} XP`, "info");
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setConfirming(undefined);
    }
  }, [confirming, id, repo, hintCost, push]);

  const giveUp = async () => {
    try {
      await api.giveUp(id, repo);
      setActiveCase(undefined);
      navigate(`/case/${id}/debrief`);
    } catch (e) {
      push((e as Error).message, "error");
    }
  };

  // Keyboard: R runs the tests, H asks for the next hint, Esc cancels a pending hint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "r" || e.key === "R") void runTests();
      if ((e.key === "h" || e.key === "H") && c && hints.length < c.hintCount)
        setConfirming(hints.length + 1);
      if (e.key === "Escape") setConfirming(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runTests, c, hints.length]);

  const tone: TerminalTone = running ? "running" : result ? (result.pass ? "pass" : "fail") : "idle";
  const lines = useMemo(() => {
    if (!c) return [];
    const cmd = `$ run ${c.tests.join(" ")}`;
    if (running) return [cmd, "Running the tests in your playground..."];
    if (!result) return [cmd, "Press RUN THE TESTS (or R) when you think you have found the bug."];
    const out = result.output
      .split("\n")
      .filter((l) => l.trim())
      .slice(-18);
    return [cmd, ...out, "", VERDICT[result.outcome]];
  }, [c, running, result]);

  if (error) {
    return (
      <PaperPanel tone="paper" className="mt-6 max-w-xl p-8">
        <Stamp size="lg">Radio silence</Stamp>
        <p className="mt-6 font-typewriter">{error}</p>
      </PaperPanel>
    );
  }
  if (!c || !session) {
    return (
      <div className="mt-6 h-64 max-w-5xl animate-pulse rounded-[2px] border-[3px] border-line bg-navy" />
    );
  }
  if (!session.startedAt) return <Navigate to={`/case/${id}`} replace />;
  if (session.solvedAt || session.gaveUpAt) {
    return (
      <PaperPanel tone="manila" className="mt-6 max-w-xl p-8">
        <Stamp size="lg">Case closed</Stamp>
        <p className="mt-6 font-typewriter">This investigation is over.</p>
        <ArcadeButton className="mt-4" tone="paper" onClick={() => navigate(`/case/${id}/debrief`)}>
          Read the debrief
        </ArcadeButton>
      </PaperPanel>
    );
  }

  const pass = result?.pass;
  return (
    <div className="grid max-w-7xl gap-6 py-4 xl:grid-cols-[1fr_24rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <DarkPanel className="grid gap-6 p-6 md:grid-cols-[auto_1fr]">
          <Timer seconds={elapsed} parSeconds={c.parSeconds} />
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <div className="font-display text-[11px] uppercase text-muted">Case</div>
              <Link to={`/case/${id}`} className="font-display text-xl uppercase text-amber hover:underline">
                {c.brief.codename}
              </Link>
            </div>
            <div>
              <div className="font-display text-[11px] uppercase text-muted">Objective</div>
              <p className="mt-1 text-sm">
                Make <code className="font-mono text-amber">{c.tests.join(", ")}</code> pass without changing
                the tests.
              </p>
            </div>
            <div>
              <div className="mb-1 flex justify-between font-display text-[11px] uppercase">
                <span className="text-muted">XP still on the table</span>
                <span className="tabular text-amber">{xpLeft}</span>
              </div>
              <XpBar
                value={xpLeft}
                max={maxXp}
                tone={xpLeft < maxXp / 3 ? "stamp" : "amber"}
                label={`${xpLeft} XP`}
              />
            </div>
          </div>
        </DarkPanel>

        <div className="flex flex-wrap items-center gap-4">
          <ArcadeButton
            size="xl"
            icon={<Play />}
            shortcut="R"
            onClick={() => void runTests()}
            disabled={running}
          >
            {running ? "Running..." : "Run the tests"}
          </ArcadeButton>
          {pass ? (
            <Stamp slam tone="pass" size="lg">
              Verified
            </Stamp>
          ) : null}
        </div>

        <Terminal
          key={shakeKey}
          tone={tone}
          title="verification"
          lines={lines}
          shake={shakeKey > 0 && !running}
          wrap
        />

        <MentorPanel c={c} playgroundPath={session.playgroundPath} />

        <p className="text-sm text-muted">
          Out of ideas?{" "}
          <button
            type="button"
            onClick={() => setConfirmGiveUp(true)}
            className="font-display text-xs uppercase text-stamp underline"
          >
            Give up and reveal
          </button>
        </p>
      </div>

      <aside className="flex flex-col gap-4">
        <PaperPanel tone="manila" title="Hint ladder" className="pb-4">
          <div className="p-4">
            <HintLadder
              hints={hints}
              total={c.hintCount}
              cost={hintCost}
              confirming={confirming}
              onRequest={setConfirming}
              onConfirm={() => void openHint()}
              onCancel={() => setConfirming(undefined)}
              disabled={running}
            />
          </div>
        </PaperPanel>
        <p className="font-mono text-[11px] text-muted">Shortcuts: R run tests, H next hint, Esc cancel.</p>
      </aside>

      <Modal
        open={confirmGiveUp}
        onClose={() => setConfirmGiveUp(false)}
        title="Give up this case?"
        tone="stamp"
      >
        <p>You will see the original fix and the lesson, but the case pays no XP.</p>
        <div className="mt-5 flex gap-3">
          <ArcadeButton tone="paper" onClick={() => void giveUp()}>
            Reveal the fix
          </ArcadeButton>
          <ArcadeButton tone="navy" onClick={() => setConfirmGiveUp(false)}>
            Keep investigating
          </ArcadeButton>
        </div>
      </Modal>
    </div>
  );
}
