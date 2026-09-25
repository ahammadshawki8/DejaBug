import { getAdapter } from "./adapters/index.js";
import type { Config } from "./config.js";
import { isExported, playgroundPath } from "./play.js";
import type { Case, VerifyResult } from "./types.js";

// Verification (PROJECT.md 4.1 F7): run the case's tests in the player's playground.

function stripPlaygroundPath(output: string, dir: string): string {
  const variants = [dir, dir.replace(/\\/g, "/")].map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return variants.reduce((out, v) => out.replace(new RegExp(`${v}[\\\\/]?`, "g"), ""), output);
}

export async function verify(c: Case, config: Config): Promise<VerifyResult> {
  const dir = playgroundPath(config, c);
  if (!isExported(dir)) throw new Error(`case ${c.id} has not been started (no playground)`);
  const adapter = getAdapter(c.language);
  const started = Date.now();
  // A shorter per-test timeout than certification: a hang still reads as "hang", but players wait less.
  const result = await adapter.runTests(dir, c.packages, c.tests, { testTimeoutSec: 20 });
  const output = stripPlaygroundPath(result.output, dir);
  return {
    pass: result.outcome === "pass",
    outcome: result.outcome,
    failingTests: result.failingTests,
    output: output.length > 6000 ? output.slice(-6000) : output,
    durationMs: Date.now() - started,
  };
}
