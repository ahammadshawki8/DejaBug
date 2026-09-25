# T3.3 Forger plan

## Overview

Implement the three deliverables of checklist item T3.3:

1. Add the `deja-forger` custom mode to `.bob/custom_modes.yaml` (read-only, no edit or execute).
2. Write `.bob/skills/forge-case/SKILL.md` with the Brief JSON schema, spoiler rules, and
   3-step hint ladder.
3. Write `packages/engine/src/briefer.ts` exporting `brief()`, which builds a prompt from the
   skill file, dispatches to watsonx or `bob run`, validates with Zod, runs `checkSpoilers`, and
   retries once if spoilers are found.

No CLI wiring (that is T3.4b). No changes to existing files except:
- `.bob/custom_modes.yaml` (append the new mode)
- `packages/engine/package.json` (add `zod` dependency)
- `packages/engine/src/index.ts` (re-export `brief` and the `BriefInput` type)

---

## Sub-task A: deja-forger mode in custom_modes.yaml

**Intent**
The `deja-forger` mode is the Bob persona that receives the forge-case prompt and produces the
Brief JSON. It must be read-only (no edit, no execute) so it cannot accidentally modify the
repository while running headless. The skill group is included so the mode can load
`forge-case/SKILL.md` when invoked interactively.

**Expected outcomes**
- `.bob/custom_modes.yaml` contains a second entry with `slug: deja-forger`.
- The mode appears in the Bob mode picker.
- The only groups are `read` and `skill`. No `edit`, no `execute`, no `mcp`.

**Todo list**
- [ ] Read `.bob/custom_modes.yaml` (already done above).
- [ ] Append the `deja-forger` entry keeping the existing `submission-writer` entry intact.
- [ ] Confirm slug regex passes (`^[a-zA-Z0-9-]+$`), no duplicate slugs, no em dashes.

**Relevant context**
- `.bob/custom_modes.yaml` - existing file to append to.
- `create-mode` skill - schema reference (slug regex, groups table, fileRegex rules).
- PROJECT.md 4.3 B1: "deja-forger (read-only, writes case JSON only)".

**Status:** [ ] pending

---

## Sub-task B: forge-case/SKILL.md

**Intent**
The skill file is the primary instruction source for the forger. It is loaded by both:
- the `deja-forger` mode when invoked interactively, and
- `briefer.ts`, which reads the file and injects its content into the LLM prompt as the system
  message.

The skill must cover:
- The Brief JSON schema (mirroring the `Brief` interface in `types.ts`).
- Spoiler rules: describe symptoms like a user report; never name the fix's identifiers.
- The 3-step hint ladder: nudge (no code), direction (points to the code area), near-answer
  (describes the mechanism but does not write the fix).
- Difficulty 1-3 rubric (1 = pattern match, 2 = subtle state/timing bug, 3 = distributed/
  protocol bug).
- Precinct = the code area (package or subsystem name, not a file path).

**Expected outcomes**
- `.bob/skills/forge-case/SKILL.md` exists and is valid Bob skill frontmatter.
- It defines the exact JSON schema expected by the Zod validator in `briefer.ts`.
- It contains the spoiler rule ("never name identifiers introduced by the fix").
- It contains the 3-step hint ladder descriptions.
- It contains the difficulty and precinct definitions.

**Todo list**
- [ ] Create `.bob/skills/forge-case/` directory (write_file creates it automatically).
- [ ] Write `SKILL.md` with frontmatter (`name`, `description`), then prose sections:
  - Section 1: output contract (JSON only, no prose wrapper).
  - Section 2: Brief JSON schema with field-by-field descriptions.
  - Section 3: spoiler rules.
  - Section 4: hint ladder (3 levels, labeled nudge/direction/near-answer).
  - Section 5: difficulty rubric (1-3).
  - Section 6: precinct rule.

**Relevant context**
- `packages/engine/src/types.ts` - `Brief` interface is the ground truth for field names and types.
- `packages/engine/src/spoiler.ts` - `checkSpoilers` checks `symptoms`, `evidence`, and all 3
  hints. The `lesson` field is shown only in debrief, so it MAY name the fix.
- PROJECT.md 4.1 F3: symptom report "written like a user report", evidence snippet, 3 tiered hints,
  difficulty 1-3, precinct (code area), lesson learned, tags.

**Status:** [ ] pending

---

## Sub-task C: packages/engine/src/briefer.ts

**Intent**
`briefer.ts` bridges the engine pipeline to the LLM. It:
1. Reads `SKILL.md` from disk (relative to `config.repoRoot`) to get the system prompt.
2. Builds a user prompt from `Candidate`, `Certification`, `GitHubContext`, and `fixDiff`.
3. Dispatches to the correct provider:
   - `watsonx`: calls `WatsonxClient.chat()` with `json: true`. Model from
     `config.watsonx.modelId`. Prompt is the system + user messages.
   - `bob`: spawns `bob run --format json --mode deja-forger --max-cost <config.bobMaxCost>
     --max-turns 6 --disable-mcp -p "<user prompt>"` via `execFile`. The cwd is
     `config.repoRoot`.
4. Extracts JSON from the response (using `extractJson` from `watsonx.ts`).
5. Validates the result with a Zod schema matching `Brief` from `types.ts`.
6. Runs `checkSpoilers(brief, fixDiff)`.
7. If spoilers are found, retries once with the spoilers listed in the prompt.
8. Returns the validated `Brief` or `null` (not throws) when all attempts fail.

**Expected outcomes**
- `packages/engine/src/briefer.ts` exists and compiles cleanly.
- It exports `brief(input: BriefInput, config: Config): Promise<Brief | null>`.
- The `BriefInput` type is exported and matches the signature in the task description.
- `zod` is added to `packages/engine/package.json` dependencies.
- `brief` and `BriefInput` are re-exported from `packages/engine/src/index.ts`.
- The watsonx path calls `WatsonxClient.fromConfig(config).chat(modelId, messages, { json: true })`.
- The bob path builds the `bob run` command string and spawns it via Node's `execFile`; stdout is
  the JSON (because `--format json` makes Bob Shell emit only structured output).
- `checkSpoilers` is called; if it returns non-empty tokens, the function retries exactly once,
  appending a "SPOILER ALERT" section to the user prompt listing the banned tokens.
- On any error (parse, validation, spoilers remaining after retry), returns `null` and logs a
  warning to stderr (no throw).

**Todo list**
- [ ] Add `zod` to `packages/engine/package.json` dependencies (`"zod": "^3.25.0"`).
- [ ] Write `packages/engine/src/briefer.ts`:
  - Import `z` from `zod`, `checkSpoilers` from `./spoiler.js`, `WatsonxClient`, `extractJson`
    from `./llm/watsonx.js`, `GitHubContext` from `./github.js`, `Candidate`, `Certification`,
    `Brief` from `./types.js`, `Config` from `./config.js`, `execFile` from
    `node:child_process`, `readFileSync` from `node:fs`, `path` from `node:path`.
  - Define `BriefInput` type.
  - Define the Zod schema (`briefSchema`) mirroring `Brief` from `types.ts`
    (`codename`, `symptoms`, `evidence`, `hints` as z.tuple([z.string(), z.string(), z.string()])`,
    `difficulty` as `z.union([z.literal(1), z.literal(2), z.literal(3)])`,
    `precinct`, `lesson`, `tags` as `z.array(z.string())`).
  - Implement `buildPrompt(input: BriefInput, skillText: string): { system: string; user: string }`.
  - Implement `callWatsonx(system, user, config): Promise<string>` using `WatsonxClient.fromConfig`.
  - Implement `callBob(user, config): Promise<string>` using `execFile` wrapped in a Promise.
  - Implement `parseAndValidate(raw: string): Brief | null` using `extractJson` + `briefSchema.safeParse`.
  - Implement `brief(input, config): Promise<Brief | null>` orchestrating the above.
- [ ] Re-export `brief` and `BriefInput` from `packages/engine/src/index.ts`.

**Relevant context**
- `packages/engine/src/types.ts` - `Brief`, `Candidate`, `Certification` interfaces.
- `packages/engine/src/config.ts` - `Config` type, `llmProvider`, `bobMaxCost`,
  `watsonx.modelId`.
- `packages/engine/src/llm/watsonx.ts` - `WatsonxClient.fromConfig()`, `WatsonxClient.chat()`,
  `extractJson()`.
- `packages/engine/src/spoiler.ts` - `checkSpoilers()`.
- `packages/engine/src/github.ts` - `GitHubContext` interface.
- PROJECT.md 9.5: `bob run --max-cost ${BOB_MAX_COST} --max-turns 6 --disable-mcp`.
- PROJECT.md 9.7: `bob run -p "..." --format json --mode <slug> -w <dir> --max-cost N --max-turns N`.
- `packages/engine/package.json` - no `zod` yet; must be added.

**Status:** [ ] pending

---

## Files to touch

| File | Action |
|---|---|
| `.bob/custom_modes.yaml` | append `deja-forger` mode entry |
| `.bob/skills/forge-case/SKILL.md` | create new |
| `packages/engine/src/briefer.ts` | create new |
| `packages/engine/package.json` | add `zod` dependency |
| `packages/engine/src/index.ts` | re-export `brief` and `BriefInput` |

No other files are touched.

---

## Design notes

- `briefer.ts` reads `SKILL.md` via `readFileSync` at call time (not at module load), so unit
  tests can override it with a minimal fixture.
- The `bob run` path writes the user prompt via the `-p` flag (not stdin) to avoid shell escaping
  issues with multiline diffs -- if the prompt is too large for `-p`, the implementation will write
  a temp file and pass it with `--input-file` if that flag exists; otherwise it truncates the diff
  to a safe limit.
- `checkSpoilers` is called on the validated `Brief` value (not the raw string), so only the
  player-visible fields are checked. The `lesson` field is excluded per `spoiler.ts`'s own
  contract.
- The retry appends the spoiler list to the user prompt under a clearly labeled section so the
  model knows exactly which tokens to avoid.
- `brief()` returns `null` on failure (not throws) so the calling pipeline (T3.4b) can skip a
  single failed case without aborting the whole batch.
