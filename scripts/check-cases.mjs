// Privacy and quality checks for committed case data (cases/<repo>/*.json).
// Usage: node scripts/check-cases.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CASE_FILE = /^[0-9a-f]{7}\.json$/;
const RULES = [
  { name: "local path", re: /AppData|dejabug-wt-|[A-Za-z]:[\\/]+Users[\\/]/ },
  { name: "email", re: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i },
  { name: "@mention", re: /(^|[\s(])@(?!someone\b)[A-Za-z0-9][A-Za-z0-9-]{1,38}\b/ },
];

let problems = 0;
let total = 0;
const root = "cases";
for (const repo of existsSync(root) ? readdirSync(root) : []) {
  const dir = path.join(root, repo);
  const files = readdirSync(dir).filter((f) => CASE_FILE.test(f));
  const names = new Map();
  for (const f of files) {
    total++;
    const text = readFileSync(path.join(dir, f), "utf8");
    for (const rule of RULES) {
      const m = rule.re.exec(text);
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
