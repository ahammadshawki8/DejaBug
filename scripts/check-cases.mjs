// Privacy and quality checks for committed case data (cases/<repo>/*.json).
// Usage: node scripts/check-cases.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CASE_FILE = /^[0-9a-f]{7}\.json$/;
const RULES = [
  // A local path is a leak when it reveals a username (C:\Users\<name>, /home/<name>) or our worktrees.
  { name: "local path", re: /dejabug-wt-|[A-Za-z]:(?:\\+|\/)Users(?:\\+|\/)[^\\/~]|\/home\/[^/\s]+\// },
  { name: "email", re: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i },
  { name: "@mention", re: /(^|[\s(])@(?!someone\b)[A-Za-z0-9][A-Za-z0-9-]{1,38}\b/ },
];

let problems = 0;
let total = 0;
const root = "cases";
for (const repo of existsSync(root) ? readdirSync(root) : []) {
  const dir = path.join(root, repo);
  // Local paths are forbidden in every JSON file; the other rules apply to case files.
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && !CASE_FILE.test(x))) {
    const m = RULES[0].re.exec(readFileSync(path.join(dir, f), "utf8"));
    if (m) {
      problems++;
      console.log(`${dir}/${f}: local path: ${m[0]}`);
    }
  }
  const files = readdirSync(dir).filter((f) => CASE_FILE.test(f));
  const names = new Map();
  for (const f of files) {
    total++;
    const text = readFileSync(path.join(dir, f), "utf8");
    // Local paths are checked everywhere. Emails and @mentions only in human-written prose (the brief and
    // original-effort stats): code in diffs and test output legitimately contains decorators like @classmethod.
    const parsed = JSON.parse(text);
    const prose = JSON.stringify({ brief: parsed.brief, original: parsed.original });
    for (const rule of RULES) {
      const m = rule.re.exec(rule.name === "local path" ? text : prose);
      if (m) {
        problems++;
        console.log(`${dir}/${f}: ${rule.name}: ${m[0].trim()}`);
      }
    }
    const codename = JSON.parse(text).brief?.codename ?? "";
    const key = codename.toLowerCase().replace(/^the\s+/, "");
    if (names.has(key)) {
      problems++;
      console.log(`${dir}/${f}: duplicate codename "${codename}" (also ${names.get(key)})`);
    } else names.set(key, f);
  }
}

console.log(problems ? `\n${problems} case data problem(s).` : `Case data check passed (${total} cases).`);
process.exitCode = problems ? 1 : 0;
