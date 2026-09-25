// Enforces project style rules: no emojis and no em dashes in tracked text files.
// Usage: node scripts/check-style.mjs
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const BINARY = /\.(png|jpe?g|gif|webp|ico|mp4|mp3|wav|woff2?|ttf|pdf|zip)$/i;
const RULES = [
  { name: "em dash", re: /\u2014/ },
  { name: "emoji", re: /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\u{FE0F}/u },
];

const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !BINARY.test(f));

let problems = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        problems++;
        console.log(`${file}:${i + 1}: ${rule.name}: ${line.trim().slice(0, 100)}`);
      }
    }
  });
}

// .env.example is tracked by git: secret keys in it must stay empty (real values belong in .env).
const SECRET_KEYS = /^(GITHUB_TOKEN|WATSONX_API_KEY|WATSONX_PROJECT_ID|BOB_API_KEY)=(.+)$/;
try {
  readFileSync(".env.example", "utf8")
    .split("\n")
    .forEach((line, i) => {
      const m = SECRET_KEYS.exec(line.trim());
      if (m) {
        problems++;
        console.log(`.env.example:${i + 1}: secret: ${m[1]} has a value. Move it to .env (gitignored).`);
      }
    });
} catch {
  /* no .env.example */
}

console.log(problems ? `\n${problems} style problem(s) found.` : "Style check passed.");
process.exitCode = problems ? 1 : 0;
