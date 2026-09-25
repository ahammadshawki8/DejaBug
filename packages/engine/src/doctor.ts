import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

function version(cmd: string, args: string[]): string | null {
  try {
    // npm-installed CLIs (like bob) are .cmd shims on Windows and need a shell.
    // The command strings here are fixed literals, never user input.
    const out =
      process.platform === "win32"
        ? execSync([cmd, ...args].join(" "), { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
        : execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.trim().split(/\r?\n/)[0] ?? "";
  } catch {
    return null;
  }
}

/** Environment checks for everything the engine shells out to. */
export function runDoctor(config: Config): Check[] {
  const git = version("git", ["--version"]);
  const go = version("go", ["version"]);
  const bob = version("bob", ["--version"]);
  const repoOk = existsSync(path.join(config.repoDir, ".git"));

  return [
    { name: "git", ok: git !== null, detail: git ?? "not found on PATH" },
    { name: "go", ok: go !== null, detail: go ?? "not found on PATH (install Go 1.22+)" },
    { name: "target repo", ok: repoOk, detail: repoOk ? config.repoDir : `missing: ${config.repoDir}` },
    {
      name: "bob shell",
      ok: bob !== null,
      detail: bob ? `bob ${bob}` : "not found (only needed for LLM_PROVIDER=bob)",
    },
    {
      name: "watsonx",
      ok: Boolean(config.watsonx.apiKey && config.watsonx.projectId),
      detail: config.watsonx.apiKey ? "credentials set" : "WATSONX_API_KEY / WATSONX_PROJECT_ID not set",
    },
  ];
}
