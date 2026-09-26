# Problem & Solution Statement
<!-- Long Description on lablab. Max 500 words (checked by scripts/check-submission.mjs). -->

## The problem

A new engineer's hardest early job is debugging code they did not write. Teams teach it slowly, and the first real practice is often an incident in production. AI assistants add a new risk. In Anthropic's 2026 randomized study of developers learning a new library, the group that learned with AI scored lower on mastery, and the largest gap was in debugging. Developers who used AI to understand the code, instead of producing it, kept their learning.

Every mature repository already holds the missing curriculum: hundreds of real bugs, each with a known fix and a test that proves it. Turning a commit into a safe, playable exercise by hand takes hours, so it goes unused.

## Our solution

DejaBug turns bug-fix history into certified cases in a detective game.

1. **Mine.** Find fix commits that change tests plus 1 to 3 source files.
2. **Certify.** In parallel git worktrees, restore the code just before the fix and add the fix's own test. The test must fail 3 out of 3 times on the buggy code and pass on the real fix. Flaky or non-compiling candidates are rejected, so no case is guessed.
3. **Brief.** IBM Bob (Bob Shell headless with a custom mode and skill) or IBM Granite on watsonx.ai reads the PR and issue thread and writes a spoiler-free case file: symptoms, evidence, three tiered hints, difficulty, code area and the lesson. A spoiler guard rejects any brief that leaks identifiers the fix introduced.
4. **Play.** The new hire gets a clean playground and debugs it in IBM Bob IDE with the Deja Mentor mode. The mentor is read-only: it asks questions and points at code, but it cannot write the fix.
5. **Debrief.** CASE CLOSED, XP, ranks and badges, and a comparison with the original team: your time against their days, your diff against their fix, and the lesson.

It is repository-agnostic: Go and Python adapters detect the language and run the tests, so any Go or Python repository with tests can be connected from the app.

## Impact

On IBM/sarama, DejaBug scanned 2,889 commits, found 703 fix-like commits and 101 runnable candidates, and certified 27 of the 44 it attempted. On IBM/python-sdk-core it certified 31 of 45. That is 55 playable cases, none written by hand. In a recorded session the Deja Mentor led a developer to the root cause of a 32-bit integer overflow with a few guiding questions, and declined when asked to just apply the patch.

## Why it matters

Every team pays for onboarding each time someone joins. DejaBug needs no content authoring: point it at a repository and the history becomes the course. Because each case is proven by the project's own tests, a team can trust the curriculum it generates, and because the mentor cannot write code, the skill stays with the engineer.

Try it: https://ahammadshawki8.github.io/DejaBug/
