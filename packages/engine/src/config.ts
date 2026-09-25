import { existsSync } from "node:fs";
import path from "node:path";

export type LlmProvider = "watsonx" | "bob";

export interface Config {
  repoRoot: string; // the DejaBug repository root
  repoDir: string; // the target repository being mined
  repoSlug: string; // owner/name of the target repository
  casesDir: string;
  playgroundsDir: string;
  port: number;
  githubToken?: string;
  llmProvider: LlmProvider;
  watsonx: { apiKey?: string; projectId?: string; url: string; modelId?: string };
  bobMaxCost: number;
}

export interface ConfigOverrides {
  /** Target repository as owner/name or a GitHub URL. Overrides DEJABUG_REPO_SLUG. */
  target?: string;
}

export const DEFAULT_TARGET = "IBM/sarama";

/** Walks up from `start` to the directory containing PROJECT.md. */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, "PROJECT.md"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

/** Accepts "owner/name", "github.com/owner/name", or a full https/ssh GitHub URL. Returns "owner/name". */
export function normalizeSlug(input: string): string {
  const cleaned = input
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const m = /(?:github\.com[/:])?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(cleaned);
  if (!m) throw new Error(`not a GitHub repository: "${input}" (expected owner/name or a GitHub URL)`);
  return `${m[1]}/${m[2]}`;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  root: string = findRepoRoot(),
  overrides: ConfigOverrides = {},
): Config {
  const envFile = path.join(root, ".env");
  if (env === process.env && existsSync(envFile)) process.loadEnvFile(envFile);

  const provider = (env.LLM_PROVIDER ?? "watsonx").toLowerCase();
  if (provider !== "watsonx" && provider !== "bob") {
    throw new Error(`LLM_PROVIDER must be "watsonx" or "bob", got "${provider}"`);
  }

  const targeted = overrides.target !== undefined;
  const repoSlug = normalizeSlug(overrides.target ?? env.DEJABUG_REPO_SLUG ?? DEFAULT_TARGET);
  const repoName = repoSlug.split("/")[1] as string;

  // An explicit --target always uses the conventional workspace/cases layout for that repository.
  const repoDirSetting = targeted ? undefined : env.DEJABUG_REPO_DIR;
  const casesDirSetting = targeted ? undefined : env.DEJABUG_CASES_DIR;

  return {
    repoRoot: root,
    repoDir: path.resolve(root, repoDirSetting ?? `workspace/${repoName}`),
    repoSlug,
    casesDir: path.resolve(root, casesDirSetting ?? `cases/${repoName}`),
    playgroundsDir: path.resolve(root, env.DEJABUG_PLAYGROUNDS_DIR ?? "playgrounds"),
    port: Number(env.DEJABUG_PORT ?? 4317),
    githubToken: env.GITHUB_TOKEN || undefined,
    llmProvider: provider,
    watsonx: {
      apiKey: env.WATSONX_API_KEY || undefined,
      projectId: env.WATSONX_PROJECT_ID || undefined,
      url: env.WATSONX_URL ?? "https://us-south.ml.cloud.ibm.com",
      modelId: env.WATSONX_MODEL_ID || undefined,
    },
    bobMaxCost: Number(env.BOB_MAX_COST ?? 1),
  };
}
