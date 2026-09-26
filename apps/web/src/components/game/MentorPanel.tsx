import { Copy } from "pixelarticons/react/Copy.js";
import type { PublicCase } from "../../api/client";
import { DarkPanel } from "./Panels";
import { useToasts } from "./Overlays";

// "Ask the Mentor" (PROJECT.md T8.2): how to open the case in IBM Bob with the read-only Deja Mentor mode,
// plus an opening message to paste. The mentor mode has read access only, so it cannot edit files.

export function mentorPrompt(c: PublicCase): string {
  return [
    `I am working on the DejaBug training case "${c.brief.codename}" in this repository.`,
    `The failing test(s): ${c.tests.join(", ")}.`,
    `Symptoms: ${c.brief.symptoms}`,
    "Coach me with the mentor skill. Do not show me the fix.",
  ].join(" ");
}

export function MentorPanel({ c, playgroundPath }: { c: PublicCase; playgroundPath?: string }) {
  const push = useToasts((s) => s.push);
  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    push(`${what} copied.`, "info");
  };
  return (
    <DarkPanel title="Ask the Deja Mentor" className="text-sm">
      <ol className="flex list-decimal flex-col gap-2 py-4 pr-4 pl-9">
        <li>
          Open your playground folder in IBM Bob.
          {playgroundPath ? (
            <button
              type="button"
              onClick={() => void copy(playgroundPath, "Playground path")}
              className="ml-2 inline-flex items-center gap-1 border-2 border-line bg-navy-2 px-1.5 font-display text-[10px] uppercase hover:text-amber"
            >
              <Copy className="size-3" /> Path
            </button>
          ) : null}
        </li>
        <li>
          In the chat, switch the mode to <strong className="text-amber">Deja Mentor</strong>. It can read
          your code but has no permission to edit it.
        </li>
        <li>
          Paste the opening message and investigate together.
          <button
            type="button"
            onClick={() => void copy(mentorPrompt(c), "Opening message")}
            className="ml-2 inline-flex items-center gap-1 border-2 border-line bg-amber px-1.5 font-display text-[10px] uppercase text-line"
          >
            <Copy className="size-3" /> Message
          </button>
        </li>
      </ol>
      <p className="border-t-2 border-navy-2 px-4 py-3 text-xs text-muted">
        The mentor answers questions with questions and points at code. Hints on this screen cost XP; the
        mentor does not.
      </p>
    </DarkPanel>
  );
}
