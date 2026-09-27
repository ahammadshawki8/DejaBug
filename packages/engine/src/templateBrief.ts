import path from "node:path";
import type { Config } from "./config.js";
import type { Brief, Candidate, Certification, Difficulty } from "./types.js";

// Case files without an AI key. When neither watsonx.ai nor Bob is configured, the forge still turns every
// certified fix into a playable case, written only from facts the proof already has: the failing test, its
// output, the files the fix touched and the size of the fix. Nothing here reads the fix's added lines, so
// it cannot leak the answer. Cases made this way are labelled "template" in Case.briefedBy.

export const TEMPLATE_BRIEFED_BY = "template";

/** True when the configured AI provider has no credentials, so briefs must come from templateBrief. */
export function aiKeyMissing(cfg: Config): boolean {
  if (cfg.llmProvider === "bob") return !process.env.BOB_API_KEY;
  return !cfg.watsonx.apiKey || !cfg.watsonx.projectId || !cfg.watsonx.modelId;
}

/** "TestVersion7Monotonicity" or "test_trailing_slash" -> "Version 7 Monotonicity" / "Trailing Slash". */
function words(testName: string): string {
  const base = testName.split(/[.:/]/).pop() ?? testName;
  const spaced = base
    .replace(/^test_?/i, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .trim();
  const title = spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return title || "Unnamed Test";
}

/** The code area of a file: its folder, or its name when it sits at the repository root. */
function area(file: string): string {
  const dir = path.posix.dirname(file.replace(/\\/g, "/"));
  const name = dir === "." ? path.posix.basename(file, path.posix.extname(file)) : dir.split("/")[0]!;
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "core"
  );
}

/** Changed lines in a unified diff, and the enclosing function of the first hunk when git names it. */
function diffShape(fixDiff: string): { changed: number; where?: string } {
  const lines = fixDiff.split(/\r?\n/);
  const changed = lines.filter((l) => /^[+-](?![+-])/.test(l)).length;
  const header = lines.find((l) => l.startsWith("@@"));
  const where = header
    ?.replace(/^@@[^@]*@@\s*/, "")
    .replace(/\s*[{:]\s*$/, "")
    .trim();
  return { changed, where: where || undefined };
}

/** Tests the recorded run shows failing (Go "--- FAIL: X", pytest "FAILED path::x"), in their order. */
function failingIn(output: string, known: string[]): string[] {
  const named = [...output.matchAll(/--- FAIL: (\S+)/g), ...output.matchAll(/FAILED \S+::([\w[\]-]+)/g)].map(
    (m) => m[1]!.split("/")[0]!,
  );
  return [...new Set(named)].filter((t) => known.length === 0 || known.includes(t));
}

export function templateBrief(candidate: Candidate, certification: Certification, fixDiff: string): Brief {
  const output = certification.failOutput ?? "";
  const failing = failingIn(output, candidate.tests);
  const tests = failing.length ? failing : candidate.tests.length ? candidate.tests : ["the fix's test"];
  const hung = /timed out|\[killed after|panic: test timed out/i.test(output);
  const evidence = output
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(-12)
    .join("\n")
    .slice(-1200);
  const { changed, where } = diffShape(fixDiff);
  const difficulty: Difficulty = changed <= 4 ? 1 : changed <= 12 ? 2 : 3;
  const files = candidate.sourceFiles;
  return {
    codename: `The ${words(tests[0]!)} Case`,
    symptoms:
      (tests.length === 1 ? `The test ${tests[0]} fails` : `The tests ${tests.join(", ")} fail`) +
      " on the code as it was just before the fix" +
      (hung ? ": the run hangs until it is killed." : "."),
    evidence: evidence || `${tests[0]} fails.`,
    hints: [
      `Run ${tests[0]} and read what it expects, one assertion at a time.`,
      `The bug lives in ${files.length === 1 ? "one file" : `${files.length} files`}: ${files.join(", ")}.`,
      `The original fix changes ${changed} line${changed === 1 ? "" : "s"}${where ? ` near ${where}` : ""}.`,
    ],
    difficulty,
    precinct: files.length ? area(files[0]!) : "core",
    lesson:
      "This case was written from the tests, without an AI key. Compare your fix with the original one below.",
    tags: [candidate.language, "no-ai"],
  };
}
