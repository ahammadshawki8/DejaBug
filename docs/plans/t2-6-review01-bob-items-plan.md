# T2.6 Plan: Apply REVIEW-01 [BOB] items in certifier.ts

## Goal
Apply REVIEW-01 items 0, 1, 2, 3, 4, 5, and 10 to `packages/engine/src/certifier.ts`.
After this task: no Go literals remain in the certifier, it uses `adapter.runTests()`, and
the worker pool uses true slot semantics.

## Files touched
- `packages/engine/src/certifier.ts` -- all logic changes
- `packages/engine/package.json` -- remove `p-limit` dependency (item 5)

## Sub-tasks

### A. Swap imports and delete dead code (items 0 prerequisites)
**Intent:** Remove the Go-specific `runGoTest` function and local error classes; pull in the
adapter registry and errors from `adapters/`.

**Expected outcomes:**
- No `execFile`, `promisify`, `execFileAsync` in certifier.ts.
- No local `TimeoutError` class.
- No `GoOutcome` / `GoResult` types.
- No `runGoTest` function.
- No `pLimit` import.
- Imports added: `getAdapter`, `TimeoutError`, `ToolMissingError` from `"./adapters/index.js"`.

**Steps:**
1. Remove lines importing `execFile`, `promisify`, `util`.
2. Remove line `const execFileAsync = promisify(execFile)`.
3. Remove the `TimeoutError` class.
4. Remove the `GoOutcome`, `GoResult` types.
5. Remove the `runGoTest` function.
6. Remove `import pLimit from "p-limit"`.
7. Add `import { getAdapter, TimeoutError, ToolMissingError } from "./adapters/index.js"`.
8. Add `import type { RunOutcome } from "./adapters/index.js"` (replaces `GoOutcome`).

**Status:** [ ] pending

---

### B. Add `sanitize` helper (item 2)
**Intent:** Strip the worktree path (which contains the Windows temp dir and username) from
all recorded output before it is stored.

**Expected outcomes:**
- A `sanitize(output, wtDir)` function exists in certifier.ts.
- Every `tail(result.output)` call is replaced with `tail(sanitize(result.output, wtDir))`.

**Steps:**
1. Add `function sanitize(output: string, wtDir: string): string` after `tail()`.
   - Escape `wtDir` for regex special chars.
   - Replace both the literal path and its forward-slash variant (replace `\` with `/`).
   - Use a global replace so all occurrences are removed.
2. Wrap every `tail(...)` call in `certifyOne` with `sanitize(..., wtDir)`.

**Status:** [ ] pending

---

### C. Wire adapter; handle hang; record output for rejected statuses (items 0, 3, 4)
**Intent:** `certifyOne` must use `adapter.runTests()` instead of `runGoTest()`, treat a hang
in the fail phase as a reproduced bug, and ensure non-certified results carry output.

**Expected outcomes:**
- `certifyOne` resolves the adapter via `getAdapter(candidate.language)`.
- All `runGoTest` call sites replaced with `adapter.runTests`.
- `GoOutcome` references replaced with `RunOutcome` (which includes `"hang"`).
- Fail phase: `outcome === "hang"` counts as a failing run (failRuns++, failOutput saved).
- Pass phase: `outcome === "hang"` -> `rejected:no-pass`.
- `rejected:build`: `failOutput` set to sanitized, tailed output.
- `rejected:no-fail` (notest in fail phase): `passOutput` set to sanitized, tailed output.
- `rejected:no-pass` (notest/fail/hang in pass phase): `passOutput` set.

**Steps:**
1. At the top of `certifyOne`, add `const adapter = getAdapter(candidate.language)`.
2. Replace each `runGoTest(wtDir, packages, tests)` call with
   `adapter.runTests(wtDir, packages, tests)`.
3. In the fail-phase loop, after the `result.outcome === "build"` branch, add a branch for
   `result.outcome === "hang"`: treat it as `"fail"` (push "fail" to failOutcomes, increment
   failRuns, save failOutput).
4. In the `rejected:build` early return, set `failOutput = sanitize(tail(result.output), wtDir)`.
5. In the `rejected:no-fail` (notest) early return in the fail phase, set
   `passOutput = sanitize(tail(result.output), wtDir)`.
6. In the pass phase, add a branch for `passResult.outcome === "hang"` -> `rejected:no-pass`,
   storing `passOutput = sanitize(tail(passResult.output), wtDir)`.
7. In the existing `passResult.outcome === "notest"` branch, set
   `passOutput = sanitize(tail(passResult.output), wtDir)`.
8. In the existing `!passOk` (fail in pass phase) branch, set
   `passOutput = sanitize(tail(passResult.output), wtDir)`.

**Status:** [ ] pending

---

### D. `ToolMissingError` aborts the whole run (item 1)
**Intent:** A missing toolchain is a fatal infrastructure error; it must not be silently
recorded as one candidate's `rejected:build`.

**Expected outcomes:**
- In the outer catch of `certify()`, `ToolMissingError` is rethrown before the fallback
  `rejected:build` conversion.
- All other unexpected errors continue to produce `rejected:build` for that candidate only.

**Steps:**
1. In `certify()`'s catch block, before the current `rejected:build` result construction,
   add `if (err instanceof ToolMissingError) throw err;`.

**Status:** [ ] pending

---

### E. Pass phase: restore full fix commit (item 10)
**Intent:** Some fix commits change non-source, non-test files (generated code, go.mod/go.sum).
Overlaying only `sourceFiles` leaves an inconsistent tree; restoring the whole commit tree
avoids spurious build failures in the pass phase.

**Expected outcomes:**
- Pass phase calls `git checkout <fixSha> -- .` in `wtDir` instead of
  `overlayFiles(wtDir, fixSha, sourceFiles)`.
- The `overlayFiles` function is still used in the fail phase (test files only).

**Steps:**
1. Replace `await overlayFiles(wtDir, fixSha, sourceFiles)` (the pass-phase call) with
   `await git(wtDir, ["checkout", fixSha, "--", "."])`.

**Status:** [ ] pending

---

### F. True worker slots; remove p-limit (item 5)
**Intent:** The current `i % concurrency` assignment can place two in-flight candidates in
the same slot index simultaneously. Replace it with N true async workers that pull from a
shared queue.

**Expected outcomes:**
- At any moment, at most one candidate is in flight per slot index.
- Results are returned in input order.
- `p-limit` is removed from the code and from `packages/engine/package.json`.

**Steps:**
1. In `certify()`, remove `const limit = pLimit(concurrency)`.
2. Declare `const results: Certification[] = new Array(candidates.length)`.
3. Declare `let next = 0`.
4. Write `const worker = async (slot: number): Promise<void> => { ... }` that loops while
   `next < candidates.length`, grabs `const idx = next++` and `const candidate = candidates[idx]`,
   then runs the same `try/catch` as before, writing into `results[idx]`.
5. Replace `return Promise.all(tasks)` with
   `await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i))); return results`.
6. Remove `p-limit` from the `dependencies` object in `packages/engine/package.json`.

**Status:** [ ] pending
