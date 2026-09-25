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
    return this.gitWithEnv({}, ...args);
  }

  private gitWithEnv(extra: Record<string, string>, ...args: string[]): string {
    return execFileSync("git", args, { cwd: this.dir, env: { ...GIT_ENV, ...extra }, encoding: "utf8" });
  }

  /**
   * Writes files (path -> content) and commits them with `subject`. Returns the commit sha.
   * `unixSeconds` pins both author and committer dates (for age calculations).
   */
  commit(subject: string, files: Record<string, string>, unixSeconds?: number): string {
    for (const [file, content] of Object.entries(files)) {
      const full = path.join(this.dir, file);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    const dates: Record<string, string> =
      unixSeconds === undefined
        ? {}
        : { GIT_AUTHOR_DATE: `${unixSeconds} +0000`, GIT_COMMITTER_DATE: `${unixSeconds} +0000` };
    this.git("add", "-A");
    this.gitWithEnv(dates, "commit", "-q", "-m", subject);
    return this.git("rev-parse", "HEAD").trim();
  }
}

export function goTest(name: string, body = '\tt.Log("ok")'): string {
  return `func ${name}(t *testing.T) {\n${body}\n}\n`;
}

export function goFile(pkg: string, body: string): string {
  return `package ${pkg}\n\n${body}`;
}
