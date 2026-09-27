import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";
import { BANNED_MODELS } from "./llm/watsonx.js";
import type { AiStatus, AiUpdate } from "./types.js";

// "Bring your own AI key" (Settings > AI for new cases). Keys are written only to the local .env of this
// DejaBug checkout and applied to the running engine; the status endpoint never returns a key.

export const DEFAULT_MODEL = "ibm/granite-4-h-small";
export const DEFAULT_WATSONX_URL = "https://us-south.ml.cloud.ibm.com";

export function aiStatus(cfg: Config): AiStatus {
  const watsonx = {
    apiKey: Boolean(cfg.watsonx.apiKey),
    projectId: Boolean(cfg.watsonx.projectId),
    modelId: cfg.watsonx.modelId,
    url: cfg.watsonx.url,
  };
  const bob = { apiKey: Boolean(process.env.BOB_API_KEY) };
  const configured =
    cfg.llmProvider === "bob" ? bob.apiKey : watsonx.apiKey && watsonx.projectId && Boolean(watsonx.modelId);
  return { provider: cfg.llmProvider, configured, watsonx, bob };
}

/** A single-line value, or undefined when left blank (blank keeps what is already saved). */
function clean(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be text`);
  const v = value.trim();
  if (!v) return undefined;
  if (/[\r\n]/.test(v) || v.length > 500) throw new Error(`${field} must be a single line`);
  return v;
}

/** Validates the update and returns the .env entries to write. */
export function aiEnvEntries(update: AiUpdate): Record<string, string> {
  if (update.provider !== "watsonx" && update.provider !== "bob") {
    throw new Error('provider must be "watsonx" or "bob"');
  }
  const entries: Record<string, string> = { LLM_PROVIDER: update.provider };
  const apiKey = clean(update.watsonxApiKey, "watsonx API key");
  const projectId = clean(update.watsonxProjectId, "watsonx project ID");
  const modelId = clean(update.watsonxModelId, "watsonx model ID");
  const url = clean(update.watsonxUrl, "watsonx URL");
  const bobKey = clean(update.bobApiKey, "Bob API key");
  if (modelId) {
    const name = modelId.split("/").pop() ?? modelId;
    if (BANNED_MODELS.has(modelId) || BANNED_MODELS.has(name)) {
      throw new Error(`${modelId} is not allowed by the hackathon rules; use ${DEFAULT_MODEL}`);
    }
  }
  if (url && !/^https:\/\/[\w.-]+(:\d+)?\/?$/.test(url))
    throw new Error("watsonx URL must be an https address");
  if (apiKey) entries.WATSONX_API_KEY = apiKey;
  if (projectId) entries.WATSONX_PROJECT_ID = projectId;
  if (modelId) entries.WATSONX_MODEL_ID = modelId;
  if (url) entries.WATSONX_URL = url;
  if (bobKey) entries.BOB_API_KEY = bobKey;
  return entries;
}

/** Replaces or appends KEY=value lines, keeping every other line of the file as it is. */
export function upsertEnv(text: string, entries: Record<string, string>): string {
  const lines = text ? text.split(/\r?\n/) : [];
  const pending = new Map(Object.entries(entries));
  const out = lines.map((line) => {
    const key = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
    if (key && pending.has(key)) {
      const value = pending.get(key)!;
      pending.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });
  while (out.length && out[out.length - 1] === "") out.pop();
  for (const [key, value] of pending) out.push(`${key}=${value}`);
  return out.join("\n") + "\n";
}

/** Writes the update to <root>/.env and to this process's environment, so new runs use it at once. */
export function saveAiSettings(root: string, update: AiUpdate): void {
  const entries = aiEnvEntries(update);
  if (update.provider === "watsonx" && !entries.WATSONX_MODEL_ID && !process.env.WATSONX_MODEL_ID) {
    entries.WATSONX_MODEL_ID = DEFAULT_MODEL;
  }
  const file = path.join(root, ".env");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  writeFileSync(file, upsertEnv(current, entries));
  for (const [key, value] of Object.entries(entries)) process.env[key] = value;
}
