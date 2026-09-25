import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

export class FixtureRepo {
  readonly dir: string;

  constructor() {
    this.dir = mkdtempSync(path.join(os.tmpdir(), "dejabug-fixture-"));
    this.git("init", "-q", "-b", "main");
    this.git("config", "commit.gpgsign", "false");
    this.git("config", "core.autocrlf", "false");
  }

  git(...args: string[]): string {
    return execFileSync("git", args, { cwd: this.dir, env: GIT_ENV, encoding: "utf8" });
  }

  /** Writes files (path -> content) and commits them with `subject`. Returns the commit sha. */
  commit(subject: string, files: Record<string, string>): string {
    for (const [file, content] of Object.entries(files)) {
      const full = path.join(this.dir, file);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    this.git("add", "-A");
    this.git("commit", "-q", "-m", subject);
    return this.git("rev-parse", "HEAD").trim();
  }
}

export function goTest(name: string, body = '\tt.Log("ok")'): string {
  return `func ${name}(t *testing.T) {\n${body}\n}\n`;
}

export function goFile(pkg: string, body: string): string {
  return `package ${pkg}\n\n${body}`;
}
