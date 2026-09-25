# Plan: T3.3b - Apply REVIEW-T3.3 items 1-4

## Overview

T3.3b applies four quality fixes identified in `docs/reviews/REVIEW-T3.3.md` after
the first real brief run. The review found that a Granite response copied example
sentences verbatim from SKILL.md, and also identified a missing JSON-parse retry,
a repeated IAM token exchange, and a broken `bob` provider on Windows.

All four items are [BOB] and must be applied before T3.6 generates every brief.

---

## Files to touch

| File | Why |
|---|---|
| `.bob/skills/forge-case/SKILL.md` | Items 1 and 2: remove concrete example text, add anti-copy rule, tighten codename rule |
| `packages/engine/src/briefer.ts` | Items 3 and 4: retry on invalid JSON, cache WatsonxClient, fix Windows bob provider |

No other files are changed.

---

## Sub-tasks

### Sub-task A - SKILL.md: remove concrete example sentences (Review item 1)
**Status:** [ ] pending

**Intent**
The three Example sentences embedded in the hint-ladder section (Section 4 of SKILL.md,
lines 74-88) were copied verbatim into a generated brief. Replace every concrete example
with an abstract template and add a rule that bars any wording borrowed from the skill.

**Acceptance test**
```
grep -n "rebalance\|wait-group" .bob/skills/forge-case/SKILL.md
# must find nothing
```

**Steps**
1. In Section 4 of SKILL.md, replace the three `Example: "..."` sentences with
   abstract template strings of the form `"<observable symptom> when <condition>"`.
2. After the hint-ladder rules table (Section 2), add one line:
   "Every hint must reference the code area, test, or evidence of THIS case.
   Never reuse wording from this skill."

**Relevant context**
- `.bob/skills/forge-case/SKILL.md` lines 72-88 (the three example sentences)
- REVIEW-T3.3 item 1

---

### Sub-task B - SKILL.md: tighten codename rule (Review item 2)
**Status:** [ ] pending

**Intent**
The codename rule in the schema table currently says "2-4 words, title-case; must not
contain any identifier introduced by the fix." The review asks for a positive pattern
("evocative detective title") and explicit bad examples. Update the rule accordingly.

**Steps**
1. In the `codename` row of the schema field-rules table, expand the rule text to:
   "An evocative two-to-four-word detective title (title-case). Must not describe the
   fix or name any identifier. Good: 'The Phantom Slice'. Bad: '32-bit Overflow Guard'."

**Relevant context**
- `.bob/skills/forge-case/SKILL.md` lines 36-47 (field rules table)
- REVIEW-T3.3 item 2

---

### Sub-task C - briefer.ts: retry on invalid JSON and cache WatsonxClient (Review item 3)
**Status:** [ ] pending

**Intent**
Two independent bugs in `briefer.ts`:

1. When `parseAndValidate` returns null on attempt 1 (invalid JSON), the code logs
   and returns null immediately with no retry. This should retry once (consistent with
   the spoiler retry path).
2. `callWatsonx` calls `WatsonxClient.fromConfig(config)` on every invocation, which
   triggers a fresh IAM token exchange for every request. The client should be created
   once per `brief()` call (or per process) and reused.

**Steps**
1. In `brief()`, after `parseAndValidate(raw1)` returns null, instead of returning null
   immediately, fall through to a retry call (reuse the existing spoiler-retry code path,
   or add a parallel invalid-JSON retry before the spoiler check).
   - Log "invalid JSON (attempt 1), retrying" to stderr.
   - Call provider again with the same prompt (no spoiler tokens appended).
   - If the second parse also fails, log and return null.
2. Extract the `WatsonxClient.fromConfig(config)` call out of `callWatsonx` and into
   `brief()`, so one client instance is created and passed in (or captured in a closure).
   - `callWatsonx` signature becomes `(system, user, client, config)` or the client
     is captured in a module-level variable keyed by config hash. The simplest approach:
     create one client at the top of `brief()` when provider is `watsonx`, pass it in.

**Relevant context**
- `packages/engine/src/briefer.ts` lines 135-212
- `packages/engine/src/llm/watsonx.ts` `WatsonxClient.fromConfig` (line 46)
- REVIEW-T3.3 item 3

---

### Sub-task D - briefer.ts: fix bob provider on Windows (Review item 4)
**Status:** [ ] pending

**Intent**
`execFile("bob", [..., "-p", user], ...)` fails on Windows because `bob` is an npm
`.cmd` shim that is not directly executable via `execFile`. The fix:

- Pass `shell: true` to `execFile` so cmd.exe can resolve the `.cmd` shim.
- Deliver the prompt via stdin instead of via `-p`, to avoid the cmd.exe quoting
  problem with a 6 KB string. This requires `bob run` to accept stdin; if it does not,
  write the prompt to a temp file and pass `bob run -p "$(cat <file>)"` -- but the
  simplest path is `shell: true` + stdin.
- Parse the `bob run --format json` output envelope correctly. The current code passes
  `stdout` raw to `extractJson`. The actual shape of the JSON envelope must be checked
  (run `bob run --format json` once and inspect the output), then the final assistant
  message must be extracted before calling `extractJson` on the Brief JSON inside it.

**Investigation needed before coding**
Run: `bob run --format json --mode deja-forger --max-turns 1 -p "respond with {}" 2>/dev/null`
and capture the exact JSON shape so the extractor targets the right field.

**Steps**
1. Add `shell: true` to the `execFile` options in `callBob`.
2. Pass the prompt via stdin:
   - Remove `-p user` from the args array.
   - Set `input: user` in the `execFile` options (child_process accepts `input` for stdin).
3. Implement a `parseBobOutput(stdout: string): string` helper that finds the final
   assistant message in the `bob run --format json` envelope and returns its text
   content, so `callBob` returns that text rather than raw `stdout`.
4. Wrap in a try/catch: if `bob` is not installed, reject with a clear message.

**Acceptance test (from the review)**
```
npm run dejabug -w @dejabug/engine -- brief --only fc42022 --redo --provider bob
# must write a valid case file without error
```

**Relevant context**
- `packages/engine/src/briefer.ts` `callBob` function, lines 101-129
- REVIEW-T3.3 item 4
