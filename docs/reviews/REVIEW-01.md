# REVIEW-01 (milestone M1: certifier)

Reviewer: Claude Code. Inputs: `certifier.ts` after T2.2, and the real T2.4 batch on IBM/sarama (44 candidates attempted, 23 certified).
Items are tagged by the file they touch. **[BOB]** items go to Bob in T2.6. **[CLAUDE]** items go to Claude in T2.7.

## Evidence from the T2.4 run
- First run: 40 candidates came back `rejected:build` in about 0.4 s each, with empty output. The cause: the terminal had no Go on PATH. `execFile` failed with ENOENT, and `runGoTest` classified the empty output as a build failure. After a rerun with Go on PATH: 23 certified, 9 build, 5 no-fail, 2 no-pass, 5 timeout.
- All 5 timeouts are hang-type bugs, where the test blocks forever on the buggy code: "Fix deadlock when closing Broker", "don't retry FindCoordinator forever", and so on.
- `failOutput` contained absolute temp paths that include the local Windows username (`C:/Users/<name>/AppData/Local/Temp/dejabug-wt-<sha>/...`). Scrubbed by hand for now.

## [BOB] items (certifier.ts)

### 1. [BOB] A missing `go` binary must abort, never become `rejected:build`
- In `runGoTest`, when the error has `code === "ENOENT"` (or the spawn fails before go runs), throw a dedicated `ToolMissingError`.
- In `certify()`, let `ToolMissingError` propagate. Do not convert it into a per-candidate result.
- **Acceptance:** running with Go absent from PATH rejects the whole `certify()` promise with a clear message. No results are recorded.

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
- Pass `-timeout 45s` to `go test` and set the `execFile` timeout to 75 s. When Go's own timeout fires, the output contains `panic: test timed out after 45s` and a goroutine dump, with no `--- FAIL:` line.
- Classify `panic: test timed out` as `"fail"` (a hang), before the build-failure check.
- In the fail phase, three hangs count as three failing runs. In the pass phase, a hang means `rejected:no-pass`.
- Keep `rejected:timeout` only for the `execFile` kill (go itself stuck).
- **Acceptance:** at least 3 of the 5 T2.4 timeouts (`09ced0b 40b52c5 66e60c7 67d977b 06513c1`) become `certified` when rerun with `dejabug certify --only <shas> --redo`.
- **Time cost:** a hang case takes about 3 x 45 s on the fail phase. That is acceptable for a one-off batch.

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
