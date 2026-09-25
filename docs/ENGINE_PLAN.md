# Engine Module Design

This document is the T1.1 design artefact for `packages/engine/src/`.
It maps every engine module to the features and architecture described in
PROJECT.md Sections 4.1 and 5, and it specifies the contract each module
exposes in terms of the types already defined in `types.ts`.

---

## Overview

The engine is a Node 24 + TypeScript package that exposes:
- A set of focused modules (one concern per file), each exporting a small,
  typed public surface.
- A `commander`-based CLI (`cli.ts`) that wires the modules into subcommands.
- A `fastify`-based REST + SSE server (`server.ts`) that the web app consumes.

The modules are designed to be independently testable and invokable.
Dependencies flow strictly downward:

```
cli.ts  ----+---> miner.ts
            +---> certifier.ts  ---> miner.ts (Candidate)
            +---> briefer.ts    ---> certifier.ts (Certification)
            |                   ---> github.ts
            |                   ---> llm/
            +---> spoiler.ts    (pure, no upstream deps)
            +---> play.ts       ---> store.ts (Case)
            +---> verify.ts     ---> play.ts (playground path)
            +---> server.ts     ---> all of the above

store.ts    (read/write cases/*.json and funnel.json, no logic)
config.ts   (already exists, shared by all)
types.ts    (already exists, shared by all)
```

---

## Module Specifications

### `miner.ts` -- F1

**Responsibility:** Scan `git log` for fix-like commits in the target repo.
A fix-like commit is one that changes at least one `_test.go` file and
between one and three non-test `.go` source files.

**Public surface:**

```ts
/** Run `dejabug mine` logic programmatically. */
export async function mine(repoDir: string): Promise<Candidate[]>
```

`Candidate` is imported from `types.ts` as-is. The function:
1. Shells out to `git log --format=... --name-only` over the full history.
2. For each commit, classifies files as source (`*.go`, not `*_test.go`)
   or test (`*_test.go`).
3. Keeps commits where `testFiles.length >= 1` and
   `1 <= sourceFiles.length <= 3`.
4. Extracts `prNumber` from the commit subject with a `(#NNN)` regex.
5. Collects `packages` (the unique directory paths of the changed files,
   relative to `repoDir`; root becomes `"."`).
6. Reads the diff of each surviving commit with `git show --unified=0`
   and extracts test function names added or changed (`func Test...`
   lines in `+` hunks in test files) into `tests`.
7. Returns the full `Candidate[]` array.

**CLI command** (wired in `cli.ts`):
```
dejabug mine --repo <dir> --out <file>
```
Writes `Candidate[]` as JSON to `--out`.

**Types consumed:** `Candidate` from `types.ts`.

---

### `certifier.ts` -- F2

**Responsibility:** Prove that the test introduced by a fix fails on the
parent commit and passes on the fix commit, using isolated `git worktree`
instances. Emit typed progress events.

**Public surface:**

```ts
/**
 * Certify a list of candidates.
 * Emits ForgeEvents on `emitter` as work proceeds.
 * concurrency: how many worktrees to run in parallel (default 4).
 */
export async function certify(
  candidates: Candidate[],
  repoDir: string,
  emitter: EventEmitter,
  concurrency?: number,
): Promise<Certification[]>
```

`Certification` and `CertificationStatus` are imported from `types.ts`.
`ForgeEvent` (type `"stage"`, `"run"`, `"result"`) is emitted on `emitter`.

Certification algorithm per candidate:
1. Create a `git worktree` at a temp path for the candidate's `parentSha`.
2. Overlay test files from the `fixSha` using `git checkout fixSha -- <file>`.
3. Run `go test -run <tests> -count=1 -timeout 120s <packages>` three times.
   - If any run produces a _build failure_ (non-zero exit, no `FAIL` line,
     or a compile error): set status `rejected:build`, clean up, continue.
   - If any run _passes_: set status `rejected:no-fail`, clean up, continue.
   - If some runs fail and some pass (flaky): `rejected:flaky`.
   - All three fail: proceed to pass phase.
4. Overlay source files from `fixSha` with `git checkout fixSha -- <file>`.
5. Run `go test` once. Must pass; otherwise `rejected:no-pass`.
6. If the whole run exceeds 120 s per phase: `rejected:timeout`.
7. On success: status `certified`, record `failOutput` and `passOutput`.
8. Remove the worktree unconditionally (success or failure).

Parallelism is managed with `p-limit`. The `worker` field in `ForgeEvent`
is the slot index (0-based).

**CLI command** (wired in `cli.ts`):
```
dejabug certify --repo <dir> --candidates <file> --out <dir> [--limit N] [--concurrency N]
```
Reads `Candidate[]` from `--candidates`, writes `Certification[]` results to
`--out/certifications.json` and calls `store.writeFunnel` with summary counts.

**Types consumed:** `Candidate`, `Certification`, `CertificationStatus`,
`ForgeEvent`, `ForgeStage` from `types.ts`.

---

### `briefer.ts` -- F3

**Responsibility:** For each certified case, produce a `Brief` by calling
an LLM (watsonx Granite or Bob Shell headless) with context built from the
PR/issue thread and the fix diff.

**Public surface:**

```ts
/**
 * Generate a Brief for one certified case.
 * Uses config.llmProvider to decide which backend to call.
 * Returns null if generation fails after one retry.
 */
export async function brief(
  candidate: Candidate,
  certification: Certification,
  config: Config,
): Promise<Brief | null>
```

Steps:
1. Call `fetchContext(candidate, config)` from `github.ts` to get the PR
   body, linked issue body, and comment bodies (usernames already stripped).
2. Obtain `fixDiff` with `git diff <parentSha> <fixSha>` (source files only).
3. Build a structured prompt using the forge-case skill schema (loaded from
   `.bob/skills/forge-case/SKILL.md` at startup, or embedded as a constant).
4. Call the LLM backend:
   - `watsonx`: POST to `WATSONX_URL/ml/v1/text/generation` with an IAM token.
   - `bob`: `bob run --format json --mode deja-forger --max-cost N --max-turns 6 --disable-mcp`.
5. Parse the JSON response with Zod against the `Brief` shape from `types.ts`.
6. Run `checkSpoilers(brief, fixDiff)` from `spoiler.ts`; if it fails, retry
   once with a "remove spoilers" instruction appended to the prompt.
7. Return the validated `Brief` or null.

**Types consumed:** `Candidate`, `Certification`, `Brief`, `Config`
from `types.ts` and `config.ts`.

---

### `spoiler.ts` -- F4

**Responsibility:** Pure utility. Extract identifiers and string/numeric
literals introduced by a fix diff and detect whether any appear verbatim
in a brief's text fields.

**Public surface:**

```ts
/** Extract new identifiers and literals from `+` lines of a diff. */
export function extractSpoilers(fixDiff: string): string[]

/**
 * Return the spoiler strings found in the brief text, or [] if clean.
 * Checked fields: symptoms, evidence, hints[0..2], lesson.
 */
export function checkSpoilers(brief: Brief, fixDiff: string): string[]
```

Logic:
- Parse `+` lines (not `+++`) from the diff.
- Extract Go identifiers (`[A-Za-z_][A-Za-z0-9_]+`) longer than 4 characters,
  minus common stop-words (`err`, `true`, `false`, `nil`, `func`, etc.).
- Extract string literals (content between `"..."`) longer than 4 characters.
- Check each extracted token against the concatenated brief text fields with
  a case-sensitive substring search.

No external dependencies. Fully unit-testable with fixture strings.

**Types consumed:** `Brief` from `types.ts`.

---

### `github.ts` -- F5

**Responsibility:** Fetch PR and issue context for a candidate from the
GitHub REST API. Strip all personal information. Return original-effort stats.

**Public surface:**

```ts
export interface GitHubContext {
  prBody: string;
  issueBody: string;
  combinedComments: string; // concatenated, usernames stripped
}

/** Fetch PR + linked issue text for a candidate. ETag-cached. */
export async function fetchContext(
  candidate: Candidate,
  config: Config,
): Promise<GitHubContext>

/**
 * Compute original-effort stats from PR timeline.
 * Returns counts only (no usernames).
 */
export async function fetchOriginalEffort(
  candidate: Candidate,
  config: Config,
): Promise<OriginalEffort>
```

Rules:
- All requests include `Authorization: Bearer GITHUB_TOKEN` if set.
- Responses are cached by ETag in memory (one process lifetime).
- Username, email, and avatar fields are deleted before any text is returned.
- `prNumber` is required; if absent, return empty strings.

**Types consumed:** `Candidate`, `OriginalEffort`, `Config` from `types.ts`
and `config.ts`.

---

### `store.ts` -- persistence layer

**Responsibility:** Read and write `cases/<repo>/*.json` and `funnel.json`
on disk. No business logic.

**Public surface:**

```ts
export function readCases(casesDir: string): Case[]
export function readCase(casesDir: string, id: string): Case | undefined
export function writeCase(casesDir: string, c: Case): void
export function readFunnel(casesDir: string): Funnel | undefined
export function writeFunnel(casesDir: string, f: Funnel): void
```

File conventions:
- Each case is `<casesDir>/<id>.json` where `id` is the 7-character short SHA.
- Funnel summary is `<casesDir>/funnel.json`.
- All writes are atomic: write to a `.tmp` file, then `fs.renameSync`.

**Types consumed:** `Case`, `Funnel` from `types.ts`.

---

### `play.ts` -- F6

**Responsibility:** Export a clean playground directory for one case.

**Public surface:**

```ts
/**
 * Create a playground at playgroundsDir/<id>.
 * Idempotent: if the directory exists, return its path without re-creating.
 */
export async function exportPlayground(
  c: Case,
  config: Config,
): Promise<string>
```

Steps:
1. `git archive <parentSha> | tar -x` into a temp dir (equivalent via
   `execa` calling `git archive --format=tar <sha>` piped to tar).
2. Overlay the fix's test files with `git checkout <fixSha> -- <testFile>`
   into the temp dir.
3. Remove all `.git` history so no future commits are visible.
4. Run `git init && git add -A && git commit -m "case: <id>"` to create a
   single-commit fresh repo.
5. Write `AGENTS.md` from the template (embedded constant) describing the
   training-case context to Bob.
6. Copy `.bob/custom_modes.yaml` (the `deja-mentor` entry) into the
   playground's `.bob/`.
7. Move the temp dir to `playgroundsDir/<id>`.

**Types consumed:** `Case`, `Config`.

---

### `verify.ts` -- F7

**Responsibility:** Run the case's tests inside the exported playground and
return structured pass/fail results.

**Public surface:**

```ts
export interface VerifyResult {
  pass: boolean;
  failingTests: string[]; // names of tests that still fail
  output: string;         // raw go test output
  durationMs: number;
}

export async function verify(
  c: PublicCase,
  playgroundsDir: string,
): Promise<VerifyResult>
```

Steps:
1. Locate the playground at `playgroundsDir/<c.id>`.
2. Run `go test -run <c.tests.join('|')> -count=1 -timeout 120s <c.packages>`
   inside the playground directory.
3. Parse stdout/stderr:
   - `PASS` in output and zero exit code: `pass = true`.
   - Extract `--- FAIL: TestXxx` lines into `failingTests`.
4. Return the result.

**Types consumed:** `PublicCase`, `Config`.

---

### `server.ts` -- F9

**Responsibility:** A Fastify HTTP server that exposes the REST API and SSE
forge events defined in Section 5. Serves `PublicCase` objects (fixDiff
withheld until reveal is unlocked).

**Endpoints and their module calls:**

| Method | Path | Logic |
|--------|------|-------|
| GET | `/api/cases` | `store.readCases` -> return `PublicCase[]` |
| GET | `/api/cases/:id` | `store.readCase` -> return `PublicCase` |
| POST | `/api/cases/:id/start` | `play.exportPlayground` -> return `{ path }` |
| POST | `/api/cases/:id/verify` | `verify.verify` -> return `VerifyResult`; if pass, set reveal-unlocked flag in session |
| POST | `/api/cases/:id/hint/:n` | read case hints[n], return hint string; record hint cost in session |
| GET | `/api/cases/:id/reveal` | guard: must be unlocked; return full `Case` including `fixDiff` |
| GET | `/api/funnel` | `store.readFunnel` -> return `Funnel` |
| POST | `/api/forge` | start `mine -> certify -> brief` pipeline in background |
| GET | `/api/forge/events` | SSE: stream `ForgeEvent` objects from the running pipeline |
| GET | `/api/profile` | return persisted `Profile` JSON |
| PUT | `/api/profile` | merge and persist `Profile` JSON |

Session state (reveal lock, hint usage) is held in an in-memory Map keyed by
case ID. It resets on server restart (acceptable for hackathon scope).

The SSE endpoint writes each `ForgeEvent` as `data: <json>\n\n` and closes
after receiving `{ type: "done" }`.

**Types consumed:** `PublicCase`, `Case`, `Funnel`, `ForgeEvent`, `Config`
from `types.ts` and `config.ts`.

---

## Inter-module Data Flow (forge pipeline)

```
mine(repoDir)
  -> Candidate[]
    -> certify(candidates, repoDir, emitter, concurrency)
         -> Certification[]
           -> for each certified:
                fetchContext(candidate, config)   [github.ts]
                fetchOriginalEffort(candidate, config)  [github.ts]
                brief(candidate, certification, config) [briefer.ts]
                  -> Brief (spoiler-checked)
                -> assemble Case  [certifier / briefer caller]
                -> writeCase(casesDir, case)  [store.ts]
         -> writeFunnel(casesDir, funnel)  [store.ts]
```

---

## CLI Command Summary

| Command | Module(s) called | Output |
|---------|-----------------|--------|
| `dejabug doctor` | `doctor.ts` (exists) | checks printed to stdout |
| `dejabug mine` | `miner.ts` | `candidates.json` |
| `dejabug certify` | `certifier.ts`, `store.ts` | `certifications.json`, `funnel.json` |
| `dejabug forge` | all pipeline modules | case JSON files |
| `dejabug start <id>` | `play.ts` | playground directory |
| `dejabug verify <id>` | `verify.ts` | pass/fail JSON to stdout |
| `dejabug serve` | `server.ts` | HTTP server |

---

## Files to Create (by tier)

| File | Tier | Owner |
|------|------|-------|
| `packages/engine/src/miner.ts` | T1.2 | CLAUDE |
| `packages/engine/src/certifier.ts` | T2.1-T2.2 | BOB |
| `packages/engine/src/github.ts` | T3.1 | CLAUDE |
| `packages/engine/src/llm/watsonx.ts` | T3.2 | CLAUDE |
| `packages/engine/src/briefer.ts` | T3.3 | BOB |
| `packages/engine/src/spoiler.ts` | T3.5 | CLAUDE |
| `packages/engine/src/store.ts` | T2.3 | CLAUDE |
| `packages/engine/src/play.ts` | T4.1 | CLAUDE |
| `packages/engine/src/verify.ts` | T4.2 | CLAUDE |
| `packages/engine/src/server.ts` | T4.3 | CLAUDE |

`types.ts`, `config.ts`, `cli.ts`, and `doctor.ts` already exist and are
extended incrementally as each module is added.
