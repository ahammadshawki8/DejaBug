import type { Brief } from "./types.js";

// Spoiler guard (PROJECT.md 4.1 F4): a case brief must not reveal the fix.
// A spoiler is an identifier or literal that the fix introduced: present on added lines
// and absent from removed lines. Language-agnostic: works on any unified diff.

const MIN_LENGTH = 5;

/** Common words and keywords across languages that are never spoilers on their own. */
// prettier-ignore
const STOP = new Set([
  "return",
  "false",
  "string",
  "error",
  "errors",
  "import",
  "package",
  "const",
  "struct",
  "interface",
  "range",
  "defer",
  "break",
  "continue",
  "switch",
  "select",
  "default",
  "fallthrough",
  "float64",
  "float32",
  "int64",
  "int32",
  "int16",
  "uint64",
  "uint32",
  "uint16",
  "uint8",
  "byte",
  "bytes",
  "nil",
  "true",
  "func",
  "self",
  "class",
  "async",
  "await",
  "yield",
  "raise",
  "except",
  "finally",
  "lambda",
  "while",
  "print",
  "super",
  "public",
  "private",
  "static",
  "final",
  "throw",
  "throws",
  "Errorf",
  "Sprintf",
  "Printf",
  "Fatalf",
  "Logf",
  "Errorf",
  "fmt",
  "sync",
  "mutex",
  "Mutex",
  "Lock",
  "Unlock",
  "RLock",
  "RUnlock",
  "context",
  "Context",
  "length",
  "value",
  "values",
  "index",
  "count",
  "result",
  "results",
  "config",
  "Config",
  "client",
  "Client",
  "request",
  "Request",
  "response",
  "Response",
  "message",
  "Message",
  "buffer",
  "should",
  "would",
]);

/**
 * True for names that look like code rather than English: camelCase, PascalCase, snake_case,
 * or containing digits. Plain lowercase words ("negative", "existing") describe symptoms and
 * are allowed in briefs even when the fix happens to use them.
 */
function isCodeShaped(t: string): boolean {
  return /[A-Z0-9_]/.test(t.slice(1)) || (/^[A-Z]/.test(t) && /[a-z]/.test(t) && /[A-Z]/.test(t.slice(1)));
}

function tokensOf(lines: string[]): Set<string> {
  const tokens = new Set<string>();
  for (const line of lines) {
    const literal = /"((?:[^"\\]|\\.){5,80})"/g;
    for (const m of line.matchAll(literal)) tokens.add(m[1] as string);
    // Identifiers come from code only: string contents and comments are prose, not spoilers.
    const code = line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$|#.*$|\/\*.*?\*\//g, "");
    for (const m of code.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
      const t = m[0];
      if (t.length >= MIN_LENGTH && !STOP.has(t) && isCodeShaped(t)) tokens.add(t);
    }
  }
  return tokens;
}

/** Identifiers and string literals that appear on the diff's added lines but not its removed lines. */
export function extractSpoilers(fixDiff: string): string[] {
  const lines = fixDiff.split("\n");
  const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
  const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1));
  const before = tokensOf(removed);
  return [...tokensOf(added)].filter((t) => !before.has(t)).sort();
}

/**
 * Spoilers found in the parts of a brief the player sees before solving: symptoms, evidence,
 * and all three hints. The lesson is shown only in the debrief, so it may name the fix.
 */
export function checkSpoilers(
  brief: Pick<Brief, "symptoms" | "evidence" | "hints">,
  fixDiff: string,
): string[] {
  const visible = [brief.symptoms, brief.evidence, ...brief.hints].join("\n");
  return extractSpoilers(fixDiff).filter((token) => {
    if (/^[A-Za-z_]\w*$/.test(token)) return new RegExp(`\\b${token}\\b`).test(visible);
    return visible.includes(token);
  });
}
