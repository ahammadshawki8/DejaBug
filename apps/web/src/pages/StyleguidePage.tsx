import { Play } from "pixelarticons/react/Play.js";
import { useState, type ReactNode } from "react";
import type { PublicCase } from "../api/client";
import {
  BadgeArt,
  CorkPin,
  DifficultyPip,
  PaperClip,
  RankInsignia,
  type BadgeId,
  type RankId,
} from "../art/sprites";
import {
  ArcadeButton,
  BadgeCard,
  CaseFolder,
  DarkPanel,
  DossierTabs,
  FunnelCounter,
  HintLadder,
  MasteryRing,
  Modal,
  PaperPanel,
  StatTile,
  Stamp,
  StreakCalendar,
  Terminal,
  Timer,
  TypewriterText,
  useToasts,
  VersusPanel,
  WorkerLane,
  XpBar,
} from "../components/game";
import { usePageTitle } from "./pageTitle";

// Living style guide for the design system (T5.2 acceptance, PROJECT.md 6A.3-6A.5, 6A.10).

const SAMPLE: PublicCase = {
  id: "66e60c7",
  repo: "IBM/sarama",
  language: "go",
  fixSha: "66e60c7",
  parentSha: "",
  status: "certified",
  tests: ["TestConsumerGroupFindCoordinator"],
  packages: ["."],
  testFiles: [],
  certification: { failRuns: 3, passRuns: 1, failOutput: "", passOutput: "", durationMs: 0 },
  brief: {
    codename: "Infinite Coordinator Loop",
    symptoms:
      "The consumer group repeatedly fails to find its coordinator and logs an authorization error, causing Consume() to hang.",
    evidence: "panic: test timed out after 45s",
    difficulty: 2,
    precinct: "consumer-group",
    tags: ["retry"],
  },
  original: { mergedAt: "2023-01-25T22:07:22Z", daysOpen: 0.4, comments: 2, reviewRounds: 0 },
  bugAgeDays: 1513,
  parSeconds: 1200,
  hintCount: 3,
};

const TOKENS = [
  ["ink", "#0B1426"],
  ["navy", "#14223F"],
  ["navy-2", "#1E3159"],
  ["line", "#05080F"],
  ["manila", "#E8D49B"],
  ["paper", "#F7F1E1"],
  ["cork", "#B98A5A"],
  ["stamp", "#D7263D"],
  ["amber", "#FFB627"],
  ["pass", "#2FA84F"],
  ["muted", "#8A93A6"],
];

const RANKS: RankId[] = ["rookie", "detective", "inspector", "chief", "commissioner"];
const BADGES: BadgeId[] = [
  "cold-case-closed",
  "clean-hands",
  "beat-the-clock",
  "race-hunter",
  "protocol-whisperer",
  "precinct-master",
  "faster-than-original",
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-sm uppercase text-amber">{title}</h2>
      {children}
    </section>
  );
}

export function StyleguidePage() {
  usePageTitle("Style guide");
  const [tab, setTab] = useState<"all" | "producer" | "consumer">("all");
  const [hints, setHints] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<number>();
  const [modal, setModal] = useState(false);
  const [slam, setSlam] = useState(0);
  const push = useToasts((s) => s.push);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-10 py-2">
      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {TOKENS.map(([name, hex]) => (
            <div key={name} className="border-[3px] border-line shadow-hard-sm">
              <div className="h-14" style={{ background: `var(--color-${name})` }} />
              <div className="bg-paper px-2 py-1 font-mono text-[11px] text-text-dark">
                {name} {hex}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <DarkPanel className="flex flex-col gap-3 p-5">
          <div className="font-display text-3xl uppercase">Silkscreen: codenames and labels</div>
          <div className="font-typewriter text-lg">
            Special Elite: case reports, symptoms, evidence notes.
          </div>
          <div className="text-base">IBM Plex Sans: body text and interface copy stay highly legible.</div>
          <div className="tabular font-mono text-2xl">IBM Plex Mono: 12:07 timers and terminal output</div>
        </DarkPanel>
      </Section>

      <Section title="Pixel art">
        <div className="flex flex-wrap items-end gap-6">
          {RANKS.map((r) => (
            <div key={r} className="flex flex-col items-center gap-1">
              <RankInsignia rank={r} size={56} />
              <span className="font-display text-[10px] uppercase text-muted">{r}</span>
            </div>
          ))}
          <CorkPin size={32} />
          <PaperClip size={40} />
          <span className="flex gap-1">
            <DifficultyPip on />
            <DifficultyPip on />
            <DifficultyPip on={false} />
          </span>
        </div>
        <div className="flex flex-wrap gap-4">
          {BADGES.map((b) => (
            <BadgeArt key={b} badge={b} size={48} />
          ))}
        </div>
      </Section>

      <Section title="Buttons and stamps">
        <div className="flex flex-wrap items-center gap-4">
          <ArcadeButton size="xl" icon={<Play />} shortcut="R">
            Run the tests
          </ArcadeButton>
          <ArcadeButton tone="stamp" size="lg">
            Take the case
          </ArcadeButton>
          <ArcadeButton tone="paper">Next case</ArcadeButton>
          <ArcadeButton tone="navy" onClick={() => setModal(true)}>
            Open modal
          </ArcadeButton>
          <ArcadeButton tone="navy" onClick={() => push("Hint 1 opened: -50 XP", "info")}>
            Show toast
          </ArcadeButton>
        </div>
        <div className="flex flex-wrap items-center gap-8 py-4">
          <button type="button" onClick={() => setSlam((n) => n + 1)} aria-label="Replay stamp">
            <Stamp key={slam} size="xl" slam>
              Case closed
            </Stamp>
          </button>
          <Stamp tone="pass" size="lg">
            Verified
          </Stamp>
          <Stamp size="sm">Cold for 4.1 years</Stamp>
        </div>
      </Section>

      <Section title="Stat tiles and progress">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Open cases" value={27} tone="amber" />
          <StatTile label="Closed" value={3} />
          <StatTile label="Best time" value="4:12" tone="manila" />
          <StatTile label="Rank" value="Detective" tone="stamp" />
        </div>
        <div className="max-w-md">
          <XpBar value={640} max={900} label="640 / 900 XP" />
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <MasteryRing label="Consumer group" solved={3} total={8} />
          <MasteryRing label="Protocol" solved={5} total={5} />
          <StreakCalendar days={35} solvedDates={new Set([new Date().toISOString().slice(0, 10)])} />
        </div>
        <div className="flex flex-wrap gap-4">
          <BadgeCard
            badge="clean-hands"
            name="Clean Hands"
            description="Solve a case with no hints"
            locked={false}
            highlight
          />
          <BadgeCard badge="race-hunter" name="Race Hunter" description="Close a concurrency case" locked />
        </div>
      </Section>

      <Section title="Case board pieces">
        <DossierTabs
          label="Precinct filter"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: "All", count: 27 },
            { id: "producer", label: "Producer", count: 4 },
            { id: "consumer", label: "Consumer", count: 5 },
          ]}
        />
        <div className="cork grid gap-8 rounded-[2px] border-[3px] border-line p-8 shadow-hard sm:grid-cols-2 lg:grid-cols-4">
          <CaseFolder c={SAMPLE} state="available" />
          <CaseFolder c={{ ...SAMPLE, id: "a1b2c3d" }} state="active" />
          <CaseFolder c={{ ...SAMPLE, id: "b2c3d4e" }} state="solved" footnote="Best 11:32" />
          <CaseFolder c={{ ...SAMPLE, id: "c3d4e5f" }} state="locked" lockedReason="Reach Detective" />
        </div>
      </Section>

      <Section title="Case file and investigation">
        <PaperPanel tone="paper" clipped className="max-w-2xl p-6">
          <TypewriterText text={SAMPLE.brief.symptoms} className="text-lg leading-relaxed" />
        </PaperPanel>
        <div className="grid gap-6 lg:grid-cols-2">
          <Timer seconds={742} parSeconds={1200} />
          <HintLadder
            hints={hints}
            total={3}
            cost={50}
            confirming={confirming}
            onRequest={setConfirming}
            onConfirm={() => {
              setHints((h) => [...h, "The consumer keeps retrying after an authorization error."]);
              setConfirming(undefined);
            }}
            onCancel={() => setConfirming(undefined)}
          />
        </div>
        <Terminal
          tone="fail"
          lines={[
            "$ go test -run '^(TestConsumerGroupFindCoordinator)$' .",
            "--- FAIL: TestConsumerGroupFindCoordinator (45.00s)",
            "panic: test timed out after 45s",
            "FAIL\tgithub.com/IBM/sarama\t45.012s",
          ]}
        />
        <VersusPanel
          rows={[
            { label: "Time", you: "11:32", them: "0.4 days" },
            { label: "Hints", you: 1, them: "n/a" },
            { label: "Comments", you: 0, them: 2 },
          ]}
        />
      </Section>

      <Section title="Forge console">
        <FunnelCounter
          steps={[
            { label: "Fix commits", value: 703 },
            { label: "Candidates", value: 101, tone: "amber" },
            { label: "Certified", value: 27, tone: "pass" },
          ]}
        />
        <div className="flex flex-col gap-3">
          <WorkerLane
            index={0}
            lane={{
              sha: "fc42022",
              subject: "fix: guard 32-bit overflow",
              stage: "certify",
              failLights: [true, true],
            }}
          />
          <WorkerLane
            index={1}
            lane={{
              sha: "66e60c7",
              subject: "fix(consumer): stop retrying",
              stage: "brief",
              failLights: [true, true, true],
              passLight: true,
              writing: true,
            }}
          />
          <WorkerLane index={2} lane={{ stage: "idle", failLights: [] }} />
        </div>
      </Section>

      <Modal open={modal} onClose={() => setModal(false)} title="Rank up">
        <p>You are now a Detective. New precincts are open on the case board.</p>
      </Modal>
    </div>
  );
}
