# Queue for REVIEW-02 (collected while building; merged into REVIEW-02 at T5.8)

- [BOB] certifier.ts: for `hang` results, keep the head of the output (the `panic: test timed out ... running tests: TestX` headline) instead of the tail of the goroutine dump.
- [BOB] briefer.ts: retry once on invalid JSON as well, not only on spoilers. Reuse one WatsonxClient per process (a new client per call repeats the IAM token exchange).
- [BOB] briefer.ts `bob` provider: `bob` is a .cmd shim on Windows, so `execFile("bob")` fails without a shell, and a 6 KB prompt as an argv argument is fragile. Verify the `bob run --format json` output envelope and extract the assistant message before `extractJson`. Test with one real case in T3.6.
- [BOB] .bob/skills/forge-case/SKILL.md: the codename must be evocative and must not describe the fix ("32-bit Overflow Guard" leaks the fix; "The Phantom Slice" does not). Choose the precinct from an allowed list supplied in the prompt, not free text.
- [CLAUDE] T3.4b: pass an allowed precinct list per repository (derived from source paths/files) into the briefer input.
