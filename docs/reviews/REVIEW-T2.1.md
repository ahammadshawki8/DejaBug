# Review of T2.1 (certifier core)

Reviewer: Claude Code. Scope: `packages/engine/src/certifier.ts` as delivered by Bob in T2.1.
Every item below was verified by running `go test` against a scratch module (Go 1.27, Windows).
All items are **[BOB]**, because they touch `certifier.ts`. Apply them in the T2.2 task, before the parallel pool.

## Correctness (must fix before T2.4 runs)

### 1. [BOB] Build failures are misclassified as test failures
- **Where:** `runGoTest`, the `if (!/^FAIL\b/m.test(combined))` check.
- **Problem:** a compile error prints `FAIL\t<pkg> [build failed]` (verified), so the regex matches and the result is `"fail"`, not `"build"`. A fix whose test calls a function that does not exist yet (a feature task, not a debuggable bug) is then **certified**.
- **Fix:** classify as `"build"` when the output contains `[build failed]` or `[setup failed]`, or a `# <pkg>` compiler header, or when there is no `--- FAIL:` line at all. Classify as `"fail"` only when a `--- FAIL: TestX` line exists.
- **Acceptance:** a candidate whose test references an undefined symbol is `rejected:build`.

### 2. [BOB] `-run` pattern is not anchored
- **Where:** `runGoTest`, `const runArg = tests.join("|")`.
- **Problem:** `-run TestNew` also runs `TestNewer` (verified). Unrelated tests can flip the verdict.
- **Fix:** `const runArg = \`^(${tests.join("|")})$\``.
- **Acceptance:** only the candidate's tests run (check with `-v`).

### 3. [BOB] "no tests to run" counts as a pass
- **Where:** `runGoTest`, the success path.
- **Problem:** when `-run` matches nothing, go test exits 0 with `ok <pkg> [no tests to run]` (verified). In the pass phase that certifies a case whose tests never ran.
- **Fix:** if the output contains `[no tests to run]` or `testing: warning: no tests to run`, return a distinct outcome that maps to `rejected:no-fail` in the fail phase and `rejected:no-pass` in the pass phase.
- **Acceptance:** a candidate whose test names do not exist is rejected, never certified.

## Robustness

### 4. [BOB] A stale worktree aborts the whole run
- **Where:** `addWorktree` / `certifyone`.
- **Problem:** if a previous run crashed, `git worktree add` fails because the path exists. The error is rethrown and `certify()` rejects, losing every other result.
- **Fix:**
  - before `add`, run `git worktree prune` and remove any existing `wtDir` (`fs.rm` with recursive and force);
  - wrap each candidate so an unexpected error becomes a result, not a thrown error (for example `rejected:build` with the error message in `failOutput`).
- **Acceptance:** killing a run midway and rerunning it works, and one bad candidate never stops the others.

### 5. [BOB] Unbounded output stored in case JSON
- **Where:** `failOutput` and `passOutput`.
- **Problem:** full go test output can be tens of KB per case, and it ships inside the web bundle.
- **Fix:** keep the last 4,000 characters (the tail holds the `--- FAIL` block).

## Hygiene (CI blockers)

### 6. [BOB] Lint errors (CI runs `npm run lint`)
- Line 6: `import { EventEmitter }` is only used as a type. Use `import type { EventEmitter } from "node:events"`.
- Lines 73-74: `let stdout = ""; let stderr = "";` are useless initial assignments (`no-useless-assignment`). Declare them without initializers, or restructure.
- Run `npx prettier --write packages/engine/src/certifier.ts`.
- **Acceptance:** `npm run lint`, `npm run typecheck`, and `npx prettier --check packages` all pass.

### 7. [BOB] Naming nit
- Rename `certifyone` to `certifyOne`.
