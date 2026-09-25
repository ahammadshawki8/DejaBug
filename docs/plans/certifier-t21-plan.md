# T2.1 Plan: certifier.ts core

## Scope

Implement `packages/engine/src/certifier.ts` as described in PROJECT.md T2.1
and ENGINE_PLAN.md (the `certifier.ts -- F2` section).

**In scope (T2.1 only):**
- Worktree lifecycle: create, use, remove
- Test file overlay from the fix commit onto the parent worktree
- `go test` runner with a per-phase 120 s timeout
- Output parsing: build failure vs test failure
- 3-run fail rule and 1-run pass rule
- Every rejection status: `rejected:build`, `rejected:no-fail`, `rejected:flaky`, `rejected:no-pass`, `rejected:timeout`
- Worktree cleanup (unconditional, success or failure)
- Typed `ForgeEvent` emission on the caller-supplied `EventEmitter`

**Out of scope:**
- `p-limit` parallel pool (T2.2)
- CLI wiring, `funnel.json` writer, unit tests (T2.3)

**Files touched:**
- `packages/engine/src/certifier.ts` -- create (new file, the only deliverable)

---

## Sub-tasks

### ST1 -- Worktree lifecycle helpers

**Intent:** Provide two thin async helpers that wrap `git worktree add` and
`git worktree remove`. Keeping them separate from the main algorithm makes the
lifecycle easy to reason about and clean up in a `finally` block.

**Expected outcomes:**
- `addWorktree(repoDir, commitSha, tempDir)` creates an isolated worktree at
  `tempDir` checked out to `commitSha` using `git worktree add --detach`.
- `removeWorktree(repoDir, tempDir)` removes it with
  `git worktree remove --force`.
- Both are unexported helpers used only inside this file.

**Todo list:**
1. Import `os` and `path` from Node core, `git` from `./git.js`, and the
   required types from `./types.js`.
2. Write `async function addWorktree(repoDir, sha, wtDir): Promise<void>` that
   calls `git(repoDir, ["worktree", "add", "--detach", wtDir, sha])`.
3. Write `async function removeWorktree(repoDir, wtDir): Promise<void>` that
   calls `git(repoDir, ["worktree", "remove", "--force", wtDir])`.

**Relevant context:**
- [`git()`](packages/engine/src/git.ts:7) -- the only shell helper; takes `cwd` and `args[]`,
  returns stdout, throws on non-zero exit.

**Status:** [ ] pending

---

### ST2 -- Test-file overlay helper

**Intent:** After `addWorktree` creates the worktree at the parent commit, the
test files from the fix commit must be copied in. The canonical way is
`git checkout <fixSha> -- <file>...` run inside the worktree directory.

**Expected outcomes:**
- `overlayFiles(wtDir, repoDir, fixSha, files)` runs
  `git checkout <fixSha> -- <files...>` with `cwd = wtDir`.
  (The worktree's `.git` link means git commands run there are aware of the
  shared object store, so the fix commit's blobs are reachable.)

**Todo list:**
1. Write `async function overlayFiles(wtDir, fixSha, files): Promise<void>`
   that calls `git(wtDir, ["checkout", fixSha, "--", ...files])`.

**Relevant context:**
- [`Candidate.testFiles`](packages/engine/src/types.ts:12) and
  [`Candidate.sourceFiles`](packages/engine/src/types.ts:12) -- the lists to overlay.
- [`Candidate.packages`](packages/engine/src/types.ts:14) -- already the go test package args.

**Status:** [ ] pending

---

### ST3 -- `go test` runner with timeout and output parsing

**Intent:** Run `go test` as a child process with a hard 120 s wall-clock
timeout. Parse its stdout/stderr to classify the result as one of three
outcomes: build failure, test failure, or pass.

**Expected outcomes:**
- `runGoTest(wtDir, packages, tests, timeoutMs)` returns
  `{ outcome: "build" | "fail" | "pass"; output: string }`.
- Outcome rules (mirroring ENGINE_PLAN.md step 3):
  - If the process times out: `"build"` is not the right outcome here --
    the caller handles this via a phase-level timeout flag; within this helper,
    throw a named `TimeoutError` so the caller can set `rejected:timeout`.
  - If `go test` exits non-zero AND the combined output contains no `FAIL` line
    (i.e. it never reached the test runner, it is a compile error): `"build"`.
  - If `go test` exits non-zero AND a `FAIL` line is present: `"fail"`.
  - If `go test` exits zero: `"pass"`.

**Todo list:**
1. Import `execFile` from `node:child_process` and `promisify` from
   `node:util` (already available via `git.ts` pattern; copy the same idiom).
2. Build the `go test` argument array:
   `-run <tests.join("|")> -count=1 -timeout 120s <...packages>`.
3. Spawn `go test` with `execFile` with the `timeout` option set to `timeoutMs`
   (passed in from the caller).
4. On `ETIMEDOUT` / `ERR_CHILD_PROCESS_TIMED_OUT` error code, throw a sentinel
   `TimeoutError`.
5. Combine stdout + stderr, classify, return `{ outcome, output }`.

**Relevant context:**
- [`Candidate.tests`](packages/engine/src/types.ts:15) -- test function names for `-run`.
- [`Candidate.packages`](packages/engine/src/types.ts:14) -- package args.
- [`miner.ts` import pattern](packages/engine/src/miner.ts:1) -- same `execFile` / `promisify`
  pattern is not used there (it uses `git.ts`); use Node's `execFile` directly.

**Status:** [ ] pending

---

### ST4 -- Per-candidate certification logic (fail phase)

**Intent:** Implement the 3-run fail rule. Run the test 3 times on the
parent-commit code with the fix's test files overlaid. Determine if the runs
are all-fail (good), all-pass (rejected:no-fail), mixed (rejected:flaky), or
contain a build error (rejected:build). Emit `ForgeEvent` `"run"` events after
each attempt.

**Expected outcomes:**
- After 3 runs: if any produced `"build"`, return `rejected:build`.
- If all three produced `"pass"`, return `rejected:no-fail`.
- If some passed and some failed (mixed), return `rejected:flaky`.
- If all three failed, proceed to ST5.
- Each run emits a `{ type: "run", worker, fixSha, phase: "fail", attempt, ok }` event.
- Phase timeout (cumulative 120 s): if `TimeoutError` is thrown, return
  `rejected:timeout`.

**Todo list:**
1. Allocate a `failOutput` string (capture the first failing run's output for
   the `Certification` record).
2. Loop 3 times: call `runGoTest`, catch `TimeoutError` -> `rejected:timeout`.
3. Emit `{ type: "run", ... }` after each call.
4. After the loop, classify by counting build/fail/pass outcomes.

**Relevant context:**
- [`ForgeEvent`](packages/engine/src/types.ts:96) union type -- use the `"run"` branch.
- [`CertificationStatus`](packages/engine/src/types.ts:27) -- the status values.

**Status:** [ ] pending

---

### ST5 -- Per-candidate certification logic (pass phase)

**Intent:** After all 3 fail runs succeed, overlay the fix's source files and
run `go test` once. Must pass; otherwise `rejected:no-pass`.

**Expected outcomes:**
- Call `overlayFiles` with `candidate.sourceFiles`.
- Run `go test` once.
- If outcome is `"pass"`: status `"certified"`, record `passOutput`.
- If outcome is `"fail"` or `"build"`: status `"rejected:no-pass"`.
- If `TimeoutError`: status `"rejected:timeout"`.
- Emits `{ type: "run", ..., phase: "pass", attempt: 1, ok }`.

**Todo list:**
1. Call `overlayFiles(wtDir, fixSha, candidate.sourceFiles)`.
2. Call `runGoTest` once, catch `TimeoutError`.
3. Emit `{ type: "run", phase: "pass", attempt: 1, ok: outcome === "pass" }`.
4. Return `"certified"` or the appropriate rejection status.

**Relevant context:**
- [`Certification`](packages/engine/src/types.ts:36) -- the `passOutput` field.

**Status:** [ ] pending

---

### ST6 -- `certifyone` function and worktree cleanup

**Intent:** Compose ST1-ST5 into a single `certifyone(candidate, repoDir,
emitter, workerIndex)` function that owns the full lifecycle for one candidate:
create worktree, overlay test files, run fail phase, run pass phase, remove
worktree. The `finally` block must remove the worktree even if an unexpected
error escapes.

**Expected outcomes:**
- Creates a temp directory name derived from `os.tmpdir()` +
  `dejabug-wt-<fixSha>` (no `mkdtemp`; the path is passed to
  `git worktree add` which creates it).
- Emits `{ type: "stage", worker, fixSha, stage: "certify" }` at the start.
- Emits `{ type: "result", worker, fixSha, status }` at the end.
- Returns a fully populated `Certification` object.
- Worktree directory is always removed in `finally`.

**Todo list:**
1. Derive `wtDir` from `os.tmpdir()` and `fixSha`.
2. Wrap the whole body in `try { ... } finally { removeWorktree(...) }`.
3. Emit `"stage"` event.
4. Call `addWorktree`, `overlayFiles` (test files), fail phase (ST4), pass
   phase (ST5).
5. Assemble and return `Certification`.
6. Emit `"result"` event before returning (still inside `try`).
7. Record `durationMs` as `Date.now() - start`.

**Relevant context:**
- [`Certification`](packages/engine/src/types.ts:36) -- all fields must be populated.
- [`ForgeEvent`](packages/engine/src/types.ts:96) -- `"stage"` and `"result"` branches.

**Status:** [ ] pending

---

### ST7 -- Public `certify` export (sequential loop, no pool)

**Intent:** T2.1 requires only the core logic; T2.2 adds the parallel pool.
For now, export `certify` that runs candidates sequentially (a simple `for`
loop). T2.2 will wrap this with `p-limit`; the per-candidate function
(`certifyone`) is the unit that T2.2 will parallelize.

**Expected outcomes:**
- `export async function certify(candidates, repoDir, emitter, concurrency?)` runs each
  candidate through `certifyone` sequentially (ignores `concurrency` until T2.2).
- Returns `Certification[]`.
- The function signature matches ENGINE_PLAN.md exactly so T2.2 only needs to
  change the loop internals.

**Todo list:**
1. Write the exported `certify` function with the exact signature from
   ENGINE_PLAN.md.
2. Loop over candidates with a `for...of`, awaiting each `certifyone`.
3. Collect results, return `Certification[]`.

**Relevant context:**
- ENGINE_PLAN.md public surface for `certifier.ts`.
- [`EventEmitter`](https://nodejs.org/api/events.html) -- imported from `node:events`.

**Status:** [ ] pending

---

## Files to Touch

| File | Action |
|------|--------|
| `packages/engine/src/certifier.ts` | Create (new) |

No other file is modified. `p-limit` is not needed yet (T2.2 adds it). The
`EventEmitter` type comes from Node's built-in `node:events`; no new
dependencies are required.
