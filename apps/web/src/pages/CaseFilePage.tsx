import { motion } from "framer-motion";
import { Copy } from "pixelarticons/react/Copy.js";
import { FileText } from "pixelarticons/react/FileText.js";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, SHOWCASE, type CaseSession, type PublicCase } from "../api/client";
import { DifficultyPip } from "../art/sprites";
import {
  ArcadeButton,
  HowItWorks,
  PaperPanel,
  Stamp,
  Terminal,
  TypewriterText,
  coldLabel,
  useToasts,
} from "../components/game";
import { formatDuration } from "../lib/format";
import { baseXp } from "../lib/rules";
import { useReducedMotion, useSettings } from "../state/settings";
import { usePageTitle } from "./pageTitle";

// Case File dossier (PROJECT.md 6A.7 W2): the brief as a two-page file, then TAKE THE CASE.

function briefedByLabel(by?: string): string | undefined {
  if (!by) return undefined;
  if (by === "bob-shell") return "Briefed by IBM Bob";
  if (by.startsWith("watsonx:")) return `Briefed by IBM ${by.includes("granite") ? "Granite" : "watsonx.ai"}`;
  return undefined;
}

function Param({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b-2 border-dashed border-text-dark/25 py-2.5 last:border-b-0">
      <dt className="font-display text-[11px] uppercase text-text-dark/70">{label}</dt>
      <dd className="text-right font-display text-sm uppercase">{children}</dd>
    </div>
  );
}

export function CaseFilePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const repo = useSettings((s) => s.repo);
  const setActiveCase = useSettings((s) => s.setActiveCase);
  const reduced = useReducedMotion();
  const push = useToasts((s) => s.push);
  const [data, setData] = useState<{ case: PublicCase; session: CaseSession }>();
  const [error, setError] = useState<string>();
  const [taking, setTaking] = useState(false);
  const [playground, setPlayground] = useState<string>();
  usePageTitle("Case File", <FileText />);

  useEffect(() => {
    let live = true;
    api
      .case(id, repo)
      .then((d) => {
        if (!live) return;
        setData(d);
        setPlayground(d.session.playgroundPath);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id, repo]);

  if (error) {
    return (
      <PaperPanel tone="paper" className="mt-6 max-w-xl p-8">
        <Stamp size="lg">Missing file</Stamp>
        <p className="mt-6 font-typewriter">{error}</p>
        <Link to="/" className="mt-4 inline-block font-display text-sm uppercase text-stamp underline">
          Back to the case board
        </Link>
      </PaperPanel>
    );
  }
  if (!data) {
    return (
      <motion.div
        className="mt-6 h-96 max-w-5xl rounded-[2px] border-[3px] border-line bg-manila/60 shadow-hard"
        initial={{ opacity: 0.4 }}
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 1.4, repeat: Infinity }}
        aria-label="Pulling the file from the archive"
      />
    );
  }

  const c = data.case;
  const s = data.session;
  const solved = Boolean(s.solvedAt);
  const briefedBy = briefedByLabel(c.briefedBy);
  const evidenceLines = [`$ run ${c.tests.join(", ")}`, ...c.brief.evidence.split("\n").slice(0, 8)];

  const take = async () => {
    setTaking(true);
    try {
      const res = await api.start(id, repo);
      setPlayground(res.path);
      setData({ case: c, session: res.session });
      setActiveCase(id);
      push(
        res.created
          ? SHOWCASE
            ? "Case taken. In the showcase, runs replay real recorded results."
            : "Case taken. The playground is ready."
          : "Case reopened. Your work is where you left it.",
        "success",
      );
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setTaking(false);
    }
  };

  const copyPath = async () => {
    if (!playground) return;
    await navigator.clipboard.writeText(playground).catch(() => undefined);
    push("Path copied. Open that folder in IBM Bob.", "info");
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] py-2">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/" className="font-display text-xs uppercase text-muted hover:text-amber">
          &lt; Case board
        </Link>
        <span className="font-mono text-xs text-muted">
          {c.repo} / {c.id}
        </span>
      </div>

      {/* The folder opens: two pages slide apart from the spine. */}
      <div className="grid gap-0 lg:grid-cols-2">
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          style={{ transformOrigin: "right center" }}
        >
          <PaperPanel tone="paper" className="h-full p-6 sm:p-8 lg:border-r-[1.5px]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="font-display text-[11px] uppercase text-text-dark/60">Cold case file</div>
                <h2 className="mt-1 font-display text-3xl uppercase leading-tight">{c.brief.codename}</h2>
              </div>
              <Stamp size="sm" rotate={6} className="mr-1 mt-1">
                {solved ? "Closed" : "Open"}
              </Stamp>
            </div>

            <h3 className="font-display text-xs uppercase text-stamp">Symptom report</h3>
            <TypewriterText text={c.brief.symptoms} className="mt-2 text-lg leading-relaxed text-text-dark" />

            <h3 className="mt-8 font-display text-xs uppercase text-stamp">Evidence</h3>
            <div className="relative mt-3">
              <Terminal tone="fail" title="evidence.log" lines={evidenceLines} maxHeight={220} wrap />
            </div>
          </PaperPanel>
        </motion.div>

        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
          style={{ transformOrigin: "left center" }}
        >
          <PaperPanel tone="manila" clipped className="flex h-full flex-col p-6 sm:p-8 lg:border-l-[1.5px]">
            <h3 className="font-display text-sm uppercase">Mission parameters</h3>
            <dl className="mt-3">
              <Param label="Precinct">{c.brief.precinct}</Param>
              <Param label="Difficulty">
                <span className="flex gap-0.5" aria-label={`${c.brief.difficulty} of 3`}>
                  {[1, 2, 3].map((n) => (
                    <DifficultyPip key={n} on={n <= c.brief.difficulty} size={22} />
                  ))}
                </span>
              </Param>
              <Param label="Par time">{formatDuration(c.parSeconds)}</Param>
              <Param label="Reward">
                <span className="rounded-[2px] border-2 border-line bg-amber px-1.5 text-line">
                  up to {Math.round(baseXp(c.brief.difficulty) * 1.8)} XP
                </span>
              </Param>
              <Param label="Tests to pass">
                <span className="font-mono text-xs normal-case">{c.tests.join(", ")}</span>
              </Param>
              <Param label="Bug age">{coldLabel(c.bugAgeDays)}</Param>
              <Param label="Language">{c.language}</Param>
            </dl>
            {briefedBy ? (
              <p className="mt-3 font-mono text-[11px] text-text-dark/60">
                {briefedBy}. Certified: fails {c.certification.failRuns}x before the fix, passes after it.
              </p>
            ) : null}

            <div className="mt-auto pt-8">
              {solved ? (
                <ArcadeButton tone="paper" size="lg" onClick={() => navigate(`/case/${id}/debrief`)}>
                  Read the debrief
                </ArcadeButton>
              ) : playground ? (
                <div className="flex flex-col gap-4">
                  {SHOWCASE ? (
                    <HowItWorks caseId={id} />
                  ) : (
                    <div className="rounded-[2px] border-[3px] border-line bg-paper p-4">
                      <div className="font-display text-[11px] uppercase text-text-dark/70">
                        Your playground
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate font-mono text-xs" title={playground}>
                          {playground}
                        </code>
                        <button
                          type="button"
                          onClick={copyPath}
                          aria-label="Copy playground path"
                          className="border-2 border-line bg-amber p-1 text-line shadow-hard-sm"
                        >
                          <Copy className="size-4" />
                        </button>
                      </div>
                      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                        <li>Open this folder in IBM Bob.</li>
                        <li>
                          Switch the chat to the <strong>Deja Mentor</strong> mode. It coaches but never
                          writes the fix.
                        </li>
                        <li>
                          Find the bug, change the code, then run the tests from the investigation screen.
                        </li>
                      </ol>
                    </div>
                  )}
                  <ArcadeButton tone="amber" size="xl" onClick={() => navigate(`/case/${id}/investigate`)}>
                    Start investigating
                  </ArcadeButton>
                </div>
              ) : (
                <ArcadeButton tone="stamp" size="xl" onClick={take} disabled={taking} className="w-full">
                  {taking ? "Pulling the evidence..." : "Take the case"}
                </ArcadeButton>
              )}
            </div>
          </PaperPanel>
        </motion.div>
      </div>
    </div>
  );
}
