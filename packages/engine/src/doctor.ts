import { existsSync } from "node:fs";
import path from "node:path";
import { ADAPTERS, detectAdapter } from "./adapters/index.js";
import { commandVersion } from "./adapters/tool.js";
import type { Config } from "./config.js";
import { activateToolchain } from "./forge.js";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/** Environment checks for everything the engine shells out to, for the configured target repository. */
export function runDoctor(config: Config): Check[] {
  const git = commandVersion("git", ["--version"]);
  const bob = commandVersion("bob", ["--version"]);
  const repoOk = existsSync(path.join(config.repoDir, ".git"));
  if (repoOk) activateToolchain(config);
  const adapter = repoOk ? detectAdapter(config.repoDir) : undefined;
  const tool = adapter?.toolCheck();

  return [
    { name: "git", ok: git !== null, detail: git ?? "not found on PATH" },
    {
      name: "target repo",
      ok: repoOk,
      detail: repoOk
        ? `${config.repoSlug} at ${config.repoDir}`
        : `missing: run \`dejabug init ${config.repoSlug}\``,
    },
    {
      name: "language",
      ok: Boolean(adapter),
      detail: adapter
        ? adapter.name
        : repoOk
          ? `unsupported (adapters: ${ADAPTERS.map((a) => a.name).join(", ")})`
          : "unknown until the repo is cloned",
    },
    {
      name: "toolchain",
      ok: tool?.ok ?? false,
      detail: tool?.detail ?? "n/a",
    },
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
