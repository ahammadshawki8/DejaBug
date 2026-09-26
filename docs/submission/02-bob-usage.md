# IBM Bob Usage Statement
<!-- Max 500 words. Be specific: judges score "Application of Technology". -->

## How Bob is part of the solution

Bob runs inside DejaBug in two places.

- **Case writer (Bob Shell headless).** The briefer calls `bob run --format json --mode deja-forger` with the prompt on stdin. The custom `deja-forger` mode and the `forge-case` skill turn a fix's PR and issue thread into a spoiler-free case file. The engine parses the JSON envelope, validates it with a schema, runs a spoiler guard, and retries once. watsonx.ai Granite is the batch alternative behind the same interface.
- **Deja Mentor (custom mode as a product feature).** Every exported playground contains a `.bob/` folder with the `deja-mentor` mode and a Socratic `mentor` skill. The mode's permission group is read only, so Bob can search and read the code but cannot edit a file. The mentor answers with questions and points at lines. In our recorded session (0.252 Bobcoins) it walked a developer through a 32-bit overflow in sarama's decoder, and when asked to "just fix it and apply the patch" it kept coaching instead.

## How we built with Bob

We planned the work so that Bob built the parts that define the product, and tracked every coin.

- **Plan mode:** the engine design (T1.1), read with context mentions of PROJECT.md and the type definitions.
- **Agent mode:** the certifier, the core that proves every case fails before the fix and passes after it (T2.1), its parallel worktree pool (T2.2), and the refactor that moved it onto language adapters (T2.6).
- **Custom modes and skills:** the `deja-forger` mode and `forge-case` skill (T3.3, T3.3b), and the `deja-mentor` mode and `mentor` skill (T8.1).
- **Subagents in parallel:** four explore subagents ranked the certified cases by teaching value and difficulty (T3.4).
- **Document understanding:** reading PR and issue threads to write briefs.
- **Frontend:** the Case Board composed from the design system (T5.4).
- **Code review:** a Bob review of seven engine files (T9.1, 0.891 Bobcoins). We checked each finding against the code, applied six and rejected four with reasons.

Total: 12 Bob tasks, 37.37 of 40 Bobcoins. Our most expensive task (14.82) taught us a lesson: Bob read a large bundled file to reverse-engineer an output format. We then added cost-guard rules in `.bob/rules/` (never read bundles or node_modules, stop at about 60k context). The Bob IDE tasks after it cost between 0.25 and 4.43 coins each.

We also used Claude Code for scaffolding, the API server, tests, secondary screens and deployment. Every one of those items is listed separately in `docs/BOB_USAGE_LOG.md`, so the split is transparent.

## Evidence

- Task session summaries: `bob_sessions/` (a summary screenshot for every Bob IDE task, plus the mentor conversation).
- Usage log with coins per task: `docs/BOB_USAGE_LOG.md`.
- Bob-authored files: `packages/engine/src/certifier.ts`, `packages/engine/src/briefer.ts`, `.bob/custom_modes.yaml`, `.bob/skills/forge-case/SKILL.md`, `.bob/skills/mentor/SKILL.md`, `apps/web/src/pages/CaseBoardPage.tsx`, `docs/reviews/BOB-REVIEW.md`.
- Project context for Bob: `AGENTS.md`, `.bob/rules/`.
