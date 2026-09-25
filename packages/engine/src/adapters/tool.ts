import { execFileSync, execSync } from "node:child_process";

/** First line of `<cmd> <args>` output, or null when the command is missing or fails. */
export function commandVersion(cmd: string, args: string[]): string | null {
  try {
    // npm-installed CLIs (like bob) are .cmd shims on Windows and need a shell.
    // The command strings passed here are fixed literals, never user input.
    const out =
      process.platform === "win32"
        ? execSync([cmd, ...args].join(" "), { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
        : execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.trim().split(/\r?\n/)[0] ?? "";
  } catch {
    return null;
  }
}
