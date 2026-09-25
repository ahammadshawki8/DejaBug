import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "./config.js";
import { git } from "./git.js";
import type { Case } from "./types.js";

// Playground export (PROJECT.md 4.1 F6): the repository exactly as it was before the fix, plus the
// fix's tests, as a brand-new git repository. No history from the original project is copied, so
// the answer cannot be found with `git log`.

const MARKER = ".dejabug-case.json";
const PLAYGROUND_AUTHOR = ["-c", "user.name=DejaBug", "-c", "user.email=cases@dejabug.local"];

export function playgroundPath(config: Config, c: Pick<Case, "id">): string {
  return path.join(config.playgroundsDir, c.id);
}

export function isExported(dir: string): boolean {
  return existsSync(path.join(dir, MARKER)) && existsSync(path.join(dir, ".git"));
}

/** Training-case instructions for any coding agent (Bob reads AGENTS.md automatically). */
export function agentsTemplate(c: Case): string {
  return [
    `# DejaBug training case: ${c.brief.codename}`,
    "",
    "This repository is a **training case**. A developer is debugging a real bug that was later fixed",
    `in ${c.repo}. The failing test(s) are: ${c.tests.map((t) => `\`${t}\``).join(", ")}.`,
    "",
    "## Rules for AI assistants",
    "- Do NOT write, edit, or apply the fix. Do not produce a patch or a diff.",
    "- Coach like a senior teammate: ask one guiding question at a time, point to where to look,",
    "  and explain concepts. Let the developer make the change.",
    "- Use the `deja-mentor` mode in IBM Bob (read-only) for help.",
    "",
    "## Case file",
    `- Precinct: ${c.brief.precinct}`,
    `- Symptoms: ${c.brief.symptoms}`,
    "",
  ].join("\n");
}

/** Extracts one mode block (by slug) from a custom_modes.yaml, keeping the `customModes:` header. */
export function extractMode(yaml: string, slug: string): string | undefined {
  const blocks = yaml.split(/\n(?= {2}- slug: )/);
  const block = blocks.find(
    (b) => b.startsWith(`  - slug: ${slug}\n`) || b.includes(`\n  - slug: ${slug}\n`),
  );
  if (!block) return undefined;
  const body = block.slice(block.indexOf(`  - slug: ${slug}`));
  return `customModes:\n${body.trimEnd()}\n`;
}

/** Copies the deja-mentor mode and mentor skill (if they exist yet) into the playground's .bob/. */
function installMentor(config: Config, dir: string): void {
  const modesFile = path.join(config.repoRoot, ".bob", "custom_modes.yaml");
  const mentor = existsSync(modesFile)
    ? extractMode(readFileSync(modesFile, "utf8"), "deja-mentor")
    : undefined;
  if (mentor) {
    mkdirSync(path.join(dir, ".bob"), { recursive: true });
    writeFileSync(path.join(dir, ".bob", "custom_modes.yaml"), mentor);
  }
  const skill = path.join(config.repoRoot, ".bob", "skills", "mentor");
  if (existsSync(skill)) cpSync(skill, path.join(dir, ".bob", "skills", "mentor"), { recursive: true });
}

export interface ExportResult {
  path: string;
  created: boolean;
}

/**
 * Creates playgrounds/<id> for a case. Idempotent: an existing playground is kept (the player's
 * work is never overwritten) unless `reset` is true.
 */
export async function exportPlayground(c: Case, config: Config, reset = false): Promise<ExportResult> {
  const dest = playgroundPath(config, c);
  if (isExported(dest) && !reset) return { path: dest, created: false };
  rmSync(dest, { recursive: true, force: true });

  // Materialize the parent commit through a temporary worktree, then copy it without any git data.
  const wt = path.join(os.tmpdir(), `dejabug-play-${c.fixSha.slice(0, 12)}-${process.pid}`);
  rmSync(wt, { recursive: true, force: true });
  await git(config.repoDir, ["worktree", "prune"]).catch(() => undefined);
  // autocrlf off: the playground must match the repository byte for byte (patches, diffs).
  await git(config.repoDir, ["-c", "core.autocrlf=false", "worktree", "add", "--detach", wt, c.parentSha]);
  try {
    mkdirSync(dest, { recursive: true });
    cpSync(wt, dest, { recursive: true, filter: (src) => path.basename(src) !== ".git" });
  } finally {
    await git(config.repoDir, ["worktree", "remove", "--force", wt]).catch(() => undefined);
  }

  // Overlay the fix's tests: they fail until the player fixes the bug.
  for (const file of c.testFiles) {
    const content = await git(config.repoDir, ["show", `${c.fixSha}:${file}`]);
    mkdirSync(path.dirname(path.join(dest, file)), { recursive: true });
    writeFileSync(path.join(dest, file), content);
  }

  writeFileSync(path.join(dest, "AGENTS.md"), agentsTemplate(c));
  installMentor(config, dest);

  // A fresh repository with a single commit: the player's diff is measured against it.
  const run = (...args: string[]) => execFileSync("git", args, { cwd: dest, stdio: "ignore" });
  run("init", "-q", "-b", "main");
  run("config", "core.autocrlf", "false");
  writeFileSync(path.join(dest, ".git", "info", "exclude"), `${MARKER}\n`);
  run("add", "-A");
  run(...PLAYGROUND_AUTHOR, "commit", "-q", "--no-verify", "-m", `case ${c.id}: ${c.brief.codename}`);

  writeFileSync(
    path.join(dest, MARKER),
    JSON.stringify({ id: c.id, repo: c.repo, exportedAt: new Date().toISOString() }, null, 2),
  );
  return { path: dest, created: true };
}

/** The player's changes since the case started, excluding the case's own test files and agent files. */
export async function playerDiff(c: Case, config: Config): Promise<string> {
  const dest = playgroundPath(config, c);
  if (!isExported(dest)) return "";
  const excludes = [...c.testFiles, "AGENTS.md", ".bob"].map((f) => `:(exclude)${f}`);
  return git(dest, ["diff", "HEAD", "--", ".", ...excludes]);
}
