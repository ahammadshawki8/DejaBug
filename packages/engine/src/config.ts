import { existsSync } from "node:fs";
import path from "node:path";

export type LlmProvider = "watsonx" | "bob";

export interface Config {
  repoRoot: string; // the DejaBug repository root
  repoDir: string; // the target repository being mined (sarama)
  repoSlug: string;
  casesDir: string;
  playgroundsDir: string;
  port: number;
  githubToken?: string;
  llmProvider: LlmProvider;
  watsonx: { apiKey?: string; projectId?: string; url: string; modelId?: string };
  bobMaxCost: number;
}

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

export function loadConfig(env: NodeJS.ProcessEnv = process.env, root: string = findRepoRoot()): Config {
  const envFile = path.join(root, ".env");
  if (env === process.env && existsSync(envFile)) process.loadEnvFile(envFile);

  const provider = (env.LLM_PROVIDER ?? "watsonx").toLowerCase();
  if (provider !== "watsonx" && provider !== "bob") {
    throw new Error(`LLM_PROVIDER must be "watsonx" or "bob", got "${provider}"`);
  }

  const repoSlug = env.DEJABUG_REPO_SLUG ?? "IBM/sarama";
  const repoName = repoSlug.split("/").pop() ?? "repo";

  return {
    repoRoot: root,
    repoDir: path.resolve(root, env.DEJABUG_REPO_DIR ?? `workspace/${repoName}`),
    repoSlug,
    casesDir: path.resolve(root, env.DEJABUG_CASES_DIR ?? `cases/${repoName}`),
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
