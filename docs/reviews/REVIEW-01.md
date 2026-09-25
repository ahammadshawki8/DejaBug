# REVIEW-01 (milestone M1: certifier)

Reviewer: Claude Code. Inputs: `certifier.ts` after T2.2, and the real T2.4 batch on IBM/sarama (44 candidates attempted, 23 certified).
Items are tagged by the file they touch. **[BOB]** items go to Bob in T2.6. **[CLAUDE]** items go to Claude in T2.7.

## Evidence from the T2.4 run
- First run: 40 candidates came back `rejected:build` in about 0.4 s each, with empty output. The cause: the terminal had no Go on PATH. `execFile` failed with ENOENT, and `runGoTest` classified the empty output as a build failure. After a rerun with Go on PATH: 23 certified, 9 build, 5 no-fail, 2 no-pass, 5 timeout.
- All 5 timeouts are hang-type bugs, where the test blocks forever on the buggy code: "Fix deadlock when closing Broker", "don't retry FindCoordinator forever", and so on.
- `failOutput` contained absolute temp paths that include the local Windows username (`C:/Users/<name>/AppData/Local/Temp/dejabug-wt-<sha>/...`). Scrubbed by hand for now.

## Update after the repository-agnostic decision (PROJECT.md Rule 10)
Go-specific running and output classification move into `adapters/go.ts` (Claude, T2.5a). The Go adapter already implements items 1 and 4 at the adapter level:
- ENOENT raises `ToolMissingError`.
- `panic: test timed out` is classified as `hang`.
- `-timeout 45s` with a 75 s process kill.

Bob's certifier keeps the orchestration.

## [BOB] items (certifier.ts)

### 0. [BOB] Use the language adapter
- Replace `runGoTest` with `adapter.runTests(wtDir, candidate.packages, candidate.tests)`. Get the adapter with `getAdapter(candidate.language)` from `adapters/index.ts`.
- Import `TimeoutError` and `ToolMissingError` from `adapters/errors.ts` and delete the local copies.
- **Acceptance:** `certifier.ts` contains no `go`, `_test.go`, or go-output regex literals.

### 1. [BOB] `ToolMissingError` must abort the whole run
- In `certify()`, rethrow `ToolMissingError` instead of converting it into a per-candidate `rejected:build`.
- **Acceptance:** with the toolchain missing, `certify()` rejects with the adapter's message, and no results are recorded.

### 2. [BOB] Strip the worktree path from recorded output
- Replace every occurrence of `wtDir` in `failOutput` and `passOutput` with an empty string. Handle both `/` and `\` separators and both path forms, because go prints `C:/Users/...` on Windows. Do this in one `sanitize(output, wtDir)` helper applied before `tail()`.
- **Acceptance:** no recorded output contains `AppData`, `Temp`, or `dejabug-wt-`.

### 3. [BOB] Record output for `rejected:build`, `rejected:no-fail`, and `rejected:no-pass`
- For `rejected:build`, store the (sanitized, tailed) build output in `failOutput`.
- For `rejected:no-fail`, store the passing run's output in `passOutput`.
- For `rejected:no-pass`, keep the still-failing output in `passOutput`.
- **Why:** the Forge Console discard bin shows the reason (PROJECT.md 6A.7 W6).
- **Acceptance:** every non-certified result has non-empty output, except `rejected:timeout` from a killed process.

### 4. [BOB] Treat a hang in the fail phase as a reproduced bug
- The adapter returns `outcome: "hang"` when the test blocks until the per-test timeout.
- **In the fail phase**, a hang counts as a failing run (the bug reproduced), and its output is kept as `failOutput`.
- **In the pass phase**, a hang means `rejected:no-pass`.
- Keep `rejected:timeout` only for `TimeoutError` (the process had to be killed).
- **Acceptance:** at least 3 of the 5 T2.4 timeouts (`09ced0b 40b52c5 66e60c7 67d977b 06513c1`) become `certified` when rerun with `dejabug certify --only <shas> --redo`.

### 5. [BOB] True worker slots
- `workerIndex = i % concurrency` lets two in-flight candidates share a slot, so two cases would appear in one Forge Console lane at the same time.
- Replace it with N workers that pull from a shared queue (`let next = 0; const worker = async (slot) => { while (next < list.length) { const c = list[next++]; ... } }`), with `Promise.all` over the slots. p-limit is then unnecessary and can be removed from `package.json`.
- **Acceptance:** at any moment, at most one candidate is in flight per slot index. Results keep the input order.

## [CLAUDE] items

### 6. [CLAUDE] Preflight in `dejabug certify` (done in T2.4 hotfix)
- The CLI refuses to start when `go` is not on PATH. Already implemented and verified.

### 7. [CLAUDE] Defense in depth: sanitize on merge
- `store.mergeCertifications` strips any `.../Temp/dejabug-wt-<sha>/` prefix before writing, so a regression in item 2 can never leak a username into committed data.

### 8. [CLAUDE] Tests for items 1-4 after T2.6
- Fixture candidates: a test that deadlocks before the fix (expect `certified` with the hang handling), a missing-go run (expect a rejection with `ToolMissingError`), and assertions that outputs contain no temp paths and that build rejections carry output.

### 9. [CLAUDE] Rerun the timeouts and refresh the funnel after T2.6
- `dejabug certify --only 09ced0b,40b52c5,66e60c7,67d977b,06513c1 --redo`. Commit the results.

## Added after the second-repository test (IBM/fp-go)

### 10. [BOB] Pass phase must restore the whole fix commit, not only the source files
- **Evidence:** fp-go `56f4109` fails correctly before the fix, but its pass phase is `build`. The fix also changed files that are neither sources nor tests (generated code, `go.mod`/`go.sum`, embedded files), so overlaying only `sourceFiles` leaves an inconsistent tree.
- **Fix:** in the pass phase, run `git checkout <fixSha> -- .` in the worktree (the full fix-commit tree) instead of overlaying `sourceFiles`. The fail phase stays: parent plus the fix's test files.
- **Acceptance:** `dejabug --target IBM/fp-go certify --only 56f4109 --redo` reaches the pass phase with outcome `pass` or a genuine test failure, never a build failure caused by missing non-Go files.
- **Note:** the Go adapter now routes each package to its nearest `go.mod` (fp-go has `go.mod`, `v2/go.mod`, and `gen/v2/go.mod`). Item 0 (use the adapter) is what makes multi-module repositories work.
