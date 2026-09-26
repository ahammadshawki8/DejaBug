import { Copy } from "pixelarticons/react/Copy.js";
import { useToasts } from "./Overlays";

// Showcase explainer: how a case is played when DejaBug runs locally. The game and the editor sit side
// by side, and the local engine runs the case's test on the files the player edits.

const INSTALL =
  "git clone https://github.com/ahammadshawki8/DejaBug && cd DejaBug && npm install && npm run dev";

function Window({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "paper" | "navy";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`min-w-0 flex-1 border-[3px] border-line shadow-hard-sm ${
        tone === "paper" ? "bg-paper text-text-dark" : "bg-navy-2 text-paper"
      }`}
    >
      <div className="flex items-center gap-1.5 border-b-[3px] border-line bg-line px-2 py-1">
        <span className="size-2 bg-stamp" />
        <span className="size-2 bg-amber" />
        <span className="size-2 bg-pass" />
        <span className="ml-1 truncate font-display text-[10px] uppercase text-muted">{title}</span>
      </div>
      <div className="px-3 py-2 font-mono text-xs leading-relaxed">{children}</div>
    </div>
  );
}

export function HowItWorks({ caseId }: { caseId: string }) {
  const push = useToasts((s) => s.push);
  return (
    <section
      aria-label="How a case is played when DejaBug is installed"
      className="rounded-[2px] border-[3px] border-amber bg-navy p-4 text-paper"
    >
      <div className="font-display text-xs uppercase text-amber">How it works when installed</div>
      <p className="mt-1 text-sm text-paper/80">
        You play with two windows side by side. This page is the scoreboard; the local engine is the referee.
      </p>

      <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Window title="DejaBug" tone="navy">
          <div>case file, timer, hints</div>
          <div className="mt-1 inline-block border-2 border-line bg-amber px-1.5 font-display text-[10px] uppercase text-line">
            Run the tests
          </div>
          <div className="mt-1">verdict, XP, debrief</div>
        </Window>
        <div className="self-center font-display text-[10px] uppercase text-amber" aria-hidden>
          <span className="hidden sm:inline">engine runs the test &gt;</span>
          <span className="sm:hidden">v engine runs the test v</span>
        </div>
        <Window title="IBM Bob IDE" tone="paper">
          <div className="truncate">playgrounds/{caseId}/</div>
          <div className="text-stamp">you edit the real code here</div>
          <div>Deja Mentor chat (read only)</div>
        </Window>
      </div>

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        <li>
          <strong className="text-amber">Take the case</strong> creates a real folder on your machine: the
          repository just before the fix, plus the test that proves the bug, with no later history to peek at.
        </li>
        <li>
          Open that folder in IBM Bob, switch the chat to <strong className="text-amber">Deja Mentor</strong>,
          and fix the code yourself. The mentor asks questions and cannot edit files.
        </li>
        <li>
          <strong className="text-amber">Run the tests</strong> here: the engine runs the certified test on
          your edited files. Red means keep digging; green closes the case.
        </li>
      </ol>

      <div className="mt-3 border-t-2 border-navy-2 pt-3 text-sm text-paper/80">
        In this public showcase there is no engine, so runs replay the real recorded results, and{" "}
        <strong className="text-paper">Replay the original fix</strong> stands in for your edit.
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate border-2 border-line bg-line px-2 py-1 font-mono text-xs">
            {INSTALL}
          </code>
          <button
            type="button"
            aria-label="Copy the install command"
            onClick={() => {
              void navigator.clipboard.writeText(INSTALL).catch(() => undefined);
              push("Install command copied.", "info");
            }}
            className="border-2 border-line bg-amber p-1 text-line shadow-hard-sm"
          >
            <Copy className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
