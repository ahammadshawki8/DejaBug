# Review of T3.3 (forger), after the first real briefs

Evidence: `dejabug brief --limit 3` with Granite (ibm/granite-4-h-small).
- `fc42022` and `6b4f9be` have grounded, spoiler-free hints.
- `4d07ef2` ("missing broker API version") got hints about a consumer-group rebalance and a wait-group. They were copied verbatim from the example sentences in `.bob/skills/forge-case/SKILL.md` lines 74-87. That case file was deleted.

All items are **[BOB]**. Apply them in task T3.3b, before T3.6 generates every brief.

### 1. [BOB] SKILL.md: no concrete example sentences
- Replace the concrete example hints and symptoms with abstract templates, for example `"<observable symptom> when <condition>"`.
- Add the rule: every hint must reference the code area, test, or evidence of THIS case. Never reuse wording from the skill.
- **Acceptance:** `grep -n "rebalance\|wait-group" .bob/skills/forge-case/SKILL.md` finds nothing.

### 2. [BOB] SKILL.md: codename rules
- The codename is an evocative two-to-four-word detective title that does not describe the fix or name an identifier. Good: "The Phantom Slice", "Midnight Rebalance". Bad: "32-bit Overflow Guard", "Missing-API-Key".

### 3. [BOB] briefer.ts: retry on invalid JSON too, and reuse one WatsonxClient
- The first invalid-JSON response currently returns null without a retry. Retry once, as for spoilers.
- `WatsonxClient.fromConfig` is called for every request, so every call repeats the IAM token exchange. Cache one client per process.

### 4. [BOB] briefer.ts: make the `bob` provider work on Windows
- `execFile("bob")` fails on Windows because `bob` is an npm `.cmd` shim. Resolve this without passing a 6 KB prompt through `cmd.exe` quoting. Options: spawn with `shell: true` and pass the prompt on stdin (if `bob run` reads stdin), or write the prompt to a temp file and tell Bob to read it (`bob run -p "Read <file> and ..."`).
- Parse the real `bob run --format json` output envelope and extract the final assistant message before `extractJson`. Check the actual shape by running it once.
- **Acceptance:** `npm run dejabug -w @dejabug/engine -- brief --only fc42022 --redo --provider bob` writes a valid case file.
