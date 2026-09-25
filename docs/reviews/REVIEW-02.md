# REVIEW-02 (milestone M2: web core)

Reviewer: Claude Code. Scope: the web app after T5.1-T5.7, plus the engine items queued in `REVIEW-02-queue.md`.
Bob has only 4.5 coins left, so every item was re-tagged [CLAUDE] and applied in T5.9/T5.10 (PROJECT.md 9.2).

| # | Area | Finding | Applied |
|---|---|---|---|
| 1 | certifier.ts | Hang evidence kept the tail of the goroutine dump, losing the "test timed out ... running tests" headline | Hang results keep the head of the output |
| 2 | briefer.ts | `execFile(..., { shell: true })` with an args array triggers Node's DEP0190 warning | One fixed command string via `exec` (literals and a number only) |
| 3 | CaseBoardPage | Precinct tabs were hardcoded to sarama's areas (Rule 10), so consumer-group had no tab | Tabs derived from the data (done at T5.4 review) |
| 4 | CaseBoardPage | Solved cases were matched by id only, which breaks across repositories | Solves filtered by repository |
| 5 | InvestigationPage | "Give up and reveal" had no confirmation although it forfeits the XP | Confirmation modal |
| 6 | DebriefPage | The versus row "Discussion: you 0 comments" was meaningless | Rows: tries vs review rounds, solo vs comments |
| 7 | Web build | One 480 KB bundle | Lazy routes, the debrief with diff2html is a separate chunk (done at T5.7) |

Still open (tracked in later items): visual verification of the full loop in a browser (dev servers were stopped by Claude Code for low system memory), sounds and badges (T6), Forge Console (T7.1), repo picker (T7.0).
