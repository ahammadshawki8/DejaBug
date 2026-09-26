# REVIEW-03: Bob review merged with Claude's review

Inputs: `docs/reviews/BOB-REVIEW.md` (IBM Bob, T9.1, 10 findings over certifier.ts, forge.ts, server.ts,
verify.ts, play.ts, briefer.ts, store.ts) and Claude Code's own pass over the same files.

Every finding was checked against the code before it was accepted. Bobcoins are nearly spent, so all
accepted items are tagged [CLAUDE] (T9.3 was re-tagged for this reason).

## Accepted and applied

| # | Source | Severity | Item | Owner | Status |
|---|---|---|---|---|---|
| C1 | Claude | HIGH | The engine accepted requests from any web page. Fastify parses `text/plain` by default and there was no Host or Origin check, so a site the player visits could start a forge run, run tests, or overwrite the profile (cross-site POST), or read the API through DNS rebinding. Fix: an `onRequest` guard that allows only localhost Host headers and, for writes, only localhost origins; the `text/plain` parser is removed so the API takes JSON only. Tests in server.test.ts. | [CLAUDE] | done |
| F6 | Bob | MEDIUM | The fire-and-forget forge block had no `.catch`. A failure before `runForge` started would be an unhandled rejection (fatal in Node 24) or leave the forge locked with 409. Fix: `.catch` logs the error and emits `done`. | [CLAUDE] | done |
| F5 | Bob | MEDIUM | `.dejabug/state.json` was cast without validation; a corrupt file stopped the engine at startup. Fix: `loadState` validates the shape and starts fresh on a parse error. Test added. | [CLAUDE] | done |
| F4 | Bob | LOW (Bob: MEDIUM) | Worktree path `dejabug-wt-<sha>` could be shared by a CLI run and a server run on the same commit. Within one run candidates are unique, so this needs two processes. Fix: the path includes the process id. The path scrubber in store.ts was updated for the new suffix, with a test, so local paths still never reach case data. | [CLAUDE] | done |
| F7 | Bob | LOW (Bob: MEDIUM) | `?repo=..` passed the repo-name pattern. It only reached a 404 (no candidates file above cases/), but the pattern now rejects names that start with a dot while still allowing dotted names such as socket.io. Test added. | [CLAUDE] | done |
| F1 | Bob | LOW (Bob: HIGH) | `callBob` uses `exec` with one command string. Every part is a literal or a number, so there is no injection today; `exec` is kept because the Windows `bob.cmd` shim needs a shell. Fix: `BOB_MAX_COST` is parsed as a finite positive number with a fallback, so the only non-literal part can never be anything but a number. | [CLAUDE] | done |
| F10 | Bob | LOW | Mutating endpoints have no authentication. The engine binds to 127.0.0.1 and C1 now blocks other sites, so localhost is the documented security boundary for this local tool. | [CLAUDE] | covered by C1 |

## Rejected after checking the code

| # | Source | Reason |
|---|---|---|
| F3 | Bob | Not a race. In both worker loops the `while (next < length)` check and the `next++` read run synchronously with no `await` between them, and JavaScript runs one task at a time, so no other worker can interleave. |
| F9 | Bob | Not reachable. `history.forEach(send)` is synchronous, so no event can be pushed while it runs; the live listener is attached before the next tick. |
| F2 | Bob | History is cleared at the start of every run and a run is capped at 40 candidates (a few hundred small events). No change. |
| F8 | Bob | A `.tmp` file only survives a crash between write and rename, and the next write replaces the target. Not worth a cleanup pass for a local tool. |

Result: 105 tests pass with Go and Python available (engine and web), lint and typecheck clean.
