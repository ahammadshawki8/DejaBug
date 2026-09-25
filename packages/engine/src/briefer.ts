import { exec } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Config } from "./config.js";
import type { GitHubContext } from "./github.js";
import { extractJson, WatsonxClient } from "./llm/watsonx.js";
import { checkSpoilers } from "./spoiler.js";
import type { Brief, Candidate, Certification } from "./types.js";

// briefer.ts - generates a spoiler-free Brief for a certified case (PROJECT.md T3.3).
// Supports two LLM providers: watsonx (batch) and bob (bob run headless).
// Validates output with Zod and retries once on invalid JSON or if the spoiler guard fires.

// Module-level WatsonxClient cache keyed by "<apiKey>|<projectId>|<url>".
// Avoids repeated IAM token exchanges within a single process run.
const _wxClientCache = new Map<string, WatsonxClient>();

function getOrCreateWatsonxClient(config: Config): WatsonxClient {
  const { apiKey = "", projectId = "", url } = config.watsonx;
  const key = `${apiKey}|${projectId}|${url}`;
  let client = _wxClientCache.get(key);
  if (!client) {
    client = WatsonxClient.fromConfig(config);
    _wxClientCache.set(key, client);
  }
  return client;
}

// bob run --format json envelope shape (from bob source):
//   { type: "result", status: "success", last_message: "<assistant text>" }
// Error events are also emitted as JSON lines but the final result is the last line.
function parseBobOutput(stdout: string): string {
  // The JSON renderer writes one object per line; the result envelope is the last non-empty line.
  const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    let obj: unknown;
    try {
      obj = JSON.parse(lines[i] as string);
    } catch {
      continue;
    }
    if (obj !== null && typeof obj === "object" && (obj as Record<string, unknown>)["type"] === "result") {
      const msg = (obj as Record<string, unknown>)["last_message"];
      if (typeof msg === "string") return msg;
    }
  }
  throw new Error("bob run output did not contain a result envelope");
}

export interface BriefInput {
  candidate: Candidate;
  certification: Certification;
  context: GitHubContext;
  fixDiff: string;
}

// ---------------------------------------------------------------------------
// Zod schema - must match the Brief interface in types.ts exactly.
// ---------------------------------------------------------------------------

const difficultySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const briefSchema = z.object({
  codename: z.string().min(1),
  symptoms: z.string().min(1),
  evidence: z.string().min(1),
  hints: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  difficulty: difficultySchema,
  precinct: z.string().min(1),
  lesson: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
});

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const SKILL_REL = path.join(".bob", "skills", "forge-case", "SKILL.md");
// Max diff chars passed to the prompt. Diffs larger than this are truncated so
// the bob provider's -p argument stays within safe shell limits.
const MAX_DIFF_CHARS = 6000;

function readSkill(repoRoot: string): string {
  return readFileSync(path.join(repoRoot, SKILL_REL), "utf8");
}

function buildPrompt(
  input: BriefInput,
  skillText: string,
  spoilerTokens?: string[],
): { system: string; user: string } {
  const { candidate, certification, context, fixDiff } = input;

  const diff =
    fixDiff.length > MAX_DIFF_CHARS ? `${fixDiff.slice(0, MAX_DIFF_CHARS)}\n[diff truncated]` : fixDiff;

  const parts: string[] = [`## Commit subject\n${candidate.subject}`, `## PR title\n${context.prTitle}`];
  if (context.prBody) parts.push(`## PR body\n${context.prBody}`);
  if (context.issueTitle) parts.push(`## Issue title\n${context.issueTitle}`);
  if (context.issueBody) parts.push(`## Issue body\n${context.issueBody}`);
  if (context.combinedComments) parts.push(`## Comments\n${context.combinedComments}`);
  parts.push(`## Failing test output\n${certification.failOutput}`);
  parts.push(`## Fix diff\n${diff}`);

  if (spoilerTokens && spoilerTokens.length > 0) {
    parts.push(
      `## SPOILER ALERT - retry required\n` +
        `Your previous response contained identifiers that reveal the fix.\n` +
        `The following tokens must NOT appear in symptoms, evidence, or any hint:\n` +
        spoilerTokens.map((t) => `  - ${t}`).join("\n") +
        `\nRewrite the Brief without these tokens.`,
    );
  }

  return { system: skillText, user: parts.join("\n\n") };
}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------

async function callWatsonx(
  system: string,
  user: string,
  config: Config,
  client: WatsonxClient,
): Promise<string> {
  const modelId = config.watsonx.modelId;
  if (!modelId) throw new Error("WATSONX_MODEL_ID is not set");
  return client.chat(
    modelId,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { json: true, maxTokens: 1200 },
  );
}

function callBob(user: string, config: Config): Promise<string> {
  // On Windows, "bob" resolves as a .cmd shim which execFile cannot find without shell:true.
  // Deliver the prompt via stdin to avoid cmd.exe quoting of a potentially large string.
  return new Promise((resolve, reject) => {
    // One command string: every part is a literal or a number, so shell interpretation is safe.
    const command = `bob run --format json --mode deja-forger --max-cost ${Number(config.bobMaxCost)} --max-turns 6 --disable-mcp`;
    const child = exec(
      command,
      { cwd: config.repoRoot, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`bob run failed: ${err.message}\n${stderr.slice(0, 500)}`));
          return;
        }
        try {
          resolve(parseBobOutput(stdout));
        } catch (parseErr) {
          reject(
            new Error(
              `bob run output parse failed: ${String(parseErr)}\nraw stdout (first 500): ${stdout.slice(0, 500)}`,
            ),
          );
        }
      },
    );
    // Write prompt to stdin so cmd.exe quoting does not corrupt the content.
    child.stdin?.end(user, "utf8");
  });
}

// ---------------------------------------------------------------------------
// Parse and validate
// ---------------------------------------------------------------------------

function parseAndValidate(raw: string): Brief | null {
  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    return null;
  }
  const result = briefSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data as Brief;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generates a spoiler-free Brief for a certified case.
 * Returns null (does not throw) when all attempts fail so the pipeline can
 * skip a single case without aborting the whole batch.
 */
export async function brief(input: BriefInput, config: Config): Promise<Brief | null> {
  let skillText: string;
  try {
    skillText = readSkill(config.repoRoot);
  } catch (e) {
    process.stderr.write(`briefer: cannot read skill file: ${String(e)}\n`);
    return null;
  }

  // Create one WatsonxClient per brief() call so the IAM token is reused across retries.
  const wxClient =
    config.llmProvider === "watsonx"
      ? (() => {
          try {
            return getOrCreateWatsonxClient(config);
          } catch {
            return null;
          }
        })()
      : null;

  async function callProvider(system: string, user: string): Promise<string | null> {
    try {
      if (config.llmProvider === "watsonx") {
        if (!wxClient) throw new Error("WatsonxClient could not be created");
        return await callWatsonx(system, user, config, wxClient);
      }
      return await callBob(user, config);
    } catch (e) {
      process.stderr.write(`briefer: LLM call failed: ${String(e)}\n`);
      return null;
    }
  }

  // First attempt
  const { system, user } = buildPrompt(input, skillText);
  const raw1 = await callProvider(system, user);
  if (raw1 === null) return null;

  const validated1 = parseAndValidate(raw1);
  if (validated1 === null) {
    // Invalid JSON on attempt 1 - retry once with the same prompt before giving up.
    process.stderr.write(
      `briefer: invalid JSON from LLM for ${input.candidate.fixSha} (attempt 1), retrying\n`,
    );
    const raw1b = await callProvider(system, user);
    if (raw1b === null) return null;
    const validated1b = parseAndValidate(raw1b);
    if (validated1b === null) {
      process.stderr.write(`briefer: invalid JSON from LLM for ${input.candidate.fixSha} (attempt 1b)\n`);
      return null;
    }
    const spoilers1b = checkSpoilers(validated1b, input.fixDiff);
    if (spoilers1b.length === 0) return validated1b;
    process.stderr.write(
      `briefer: spoilers found for ${input.candidate.fixSha} (attempt 1b), retrying: ${spoilers1b.join(", ")}\n`,
    );
    const { system: sys2b, user: user2b } = buildPrompt(input, skillText, spoilers1b);
    const raw2b = await callProvider(sys2b, user2b);
    if (raw2b === null) return null;
    const validated2b = parseAndValidate(raw2b);
    if (validated2b === null) {
      process.stderr.write(`briefer: invalid JSON from LLM for ${input.candidate.fixSha} (attempt 2b)\n`);
      return null;
    }
    const spoilers2b = checkSpoilers(validated2b, input.fixDiff);
    if (spoilers2b.length > 0) {
      process.stderr.write(
        `briefer: spoilers remain after retry for ${input.candidate.fixSha}: ${spoilers2b.join(", ")}\n`,
      );
      return null;
    }
    return validated2b;
  }

  const spoilers1 = checkSpoilers(validated1, input.fixDiff);
  if (spoilers1.length === 0) return validated1;

  // One retry with spoilers listed
  process.stderr.write(
    `briefer: spoilers found for ${input.candidate.fixSha}, retrying: ${spoilers1.join(", ")}\n`,
  );
  const { system: sys2, user: user2 } = buildPrompt(input, skillText, spoilers1);
  const raw2 = await callProvider(sys2, user2);
  if (raw2 === null) return null;

  const validated2 = parseAndValidate(raw2);
  if (validated2 === null) {
    process.stderr.write(`briefer: invalid JSON from LLM for ${input.candidate.fixSha} (attempt 2)\n`);
    return null;
  }

  const spoilers2 = checkSpoilers(validated2, input.fixDiff);
  if (spoilers2.length > 0) {
    process.stderr.write(
      `briefer: spoilers remain after retry for ${input.candidate.fixSha}: ${spoilers2.join(", ")}\n`,
    );
    return null;
  }

  return validated2;
}
