// Pre-submission checks for the IBM Bob 2.0 hackathon rules.
// Usage: node scripts/check-submission.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const results = [];
const check = (ok, label, hint = "") => results.push({ ok, label, hint });

const words = (file) =>
  readFileSync(file, "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#.*$/gm, "")
    .split(/\s+/)
    .filter(Boolean).length;

for (const f of ["docs/submission/01-problem-solution.md", "docs/submission/02-bob-usage.md"]) {
  const n = words(f);
  check(n > 50 && n <= 500, `${f}: ${n} words`, n <= 50 ? "not written yet" : "must be <= 500");
}

const pngs = existsSync("bob_sessions")
  ? readdirSync("bob_sessions").filter((f) => f.toLowerCase().endsWith(".png"))
  : [];
check(pngs.length > 0, `bob_sessions/: ${pngs.length} PNG screenshot(s)`, "add a task summary screenshot for every task");

check(existsSync("LICENSE") && /MIT License/.test(readFileSync("LICENSE", "utf8")), "MIT LICENSE present");
check(!/\bTBD\b/.test(readFileSync("AGENTS.md", "utf8")), "AGENTS.md filled in", "replace the TBD fields");
check(readFileSync("docs/DATA_SOURCES.md", "utf8").split("\n").filter((l) => /^\|\s*[^|\s-]/.test(l)).length > 1,
  "docs/DATA_SOURCES.md lists sources", "list every dataset, or state 'synthetic only'");

let remote = "";
try { remote = execSync("git remote get-url origin", { stdio: "pipe" }).toString().trim(); } catch {}
check(Boolean(remote), `git remote: ${remote || "none"}`, "push to a PUBLIC GitHub repo");

let tracked = "";
try { tracked = execSync("git ls-files", { stdio: "pipe" }).toString(); } catch {}
check(!/(^|\/)\.env$/m.test(tracked), "no .env committed");

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}${r.ok || !r.hint ? "" : `  -> ${r.hint}`}`);
console.log("\nManual: video <= 3:00 with >= 90s demo · slides · cover image · app URL · feedback form after the event");
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
