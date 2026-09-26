# REVIEW-04: demo dry run (T10.1)

Run by Claude Code on the live showcase (https://ahammadshawki8.github.io/DejaBug/) at 1440x900 with a
cleared profile, following Section 8. The live mentor part was recorded by the human in T8.3.

Path: Case Board, Case File, Take the case, Start investigating, Run the tests (real recorded failure),
open hint 1, Replay the original fix, Run the tests (VERIFIED stamp), Debrief (CASE CLOSED, 247 XP,
you vs the original team, both diffs, lesson), Forge Console replay, Progress.

Result: **no blockers.** Every step worked. Frames are saved in `docs/media/` for the README and slides.

| # | Finding | Severity | Owner | Action |
|---|---|---|---|---|
| 1 | The mentor demo case, The Overflowing Slice (fc42022), is difficulty 3 and locked for a new Rookie (needs Detective, 300 XP). | Demo | [HUMAN] | In the video, play an unlocked case in the app (The Phantom Batch was used here) and cut to the recorded mentor clip for the Bob part. One solve gives about 250 XP, so a second solve unlocks Detective cases if a longer take is wanted. |
| 2 | The Forge replay finishes 8 candidates in about 10 seconds, which is short for narration. | Demo | [HUMAN] | Set Candidates to 24 before pressing Forge for a longer replay, or slow the clip in editing. |
| 3 | Deep links on GitHub Pages (for example /DejaBug/forge) return HTTP 404 with the app's fallback page, so the console shows one resource error. The page renders correctly. | Cosmetic | [CLAUDE] | Won't fix: GitHub Pages has no rewrite rules. Share the root URL. |
| 4 | Fresh clone check (T9.5): `npm install`, `npm test` (105 passed), `npm run build` and `doctor` all work; doctor names the next step (`dejabug init IBM/sarama`). | Pass | | None. |
