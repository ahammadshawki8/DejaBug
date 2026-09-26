# Bob usage log

One row per Bob task. The screenshot file lives in `bob_sessions/`.

| # | Member | Tier/item | Mode(s) | Bob features used | Coins | Screenshot |
|---|---|---|---|---|---|---|
| 1 | ahammadshawki8 | T1.1 engine plan | Plan | Plan mode, context mentions (@PROJECT.md, @types.ts), document understanding | 0.555 | dejabug_task01_engine_plan_summary.png |
| 2 | ahammadshawki8 | T2.1 certifier core | Plan, Agent | Plan mode, Agent mode, context mentions, terminal execution (go test) | 3.33 | dejabug_task02_certifier_core_summary.png |
| 3 | ahammadshawki8 | T2.2 parallel pool + REVIEW-T2.1 fixes | Plan, Agent | Plan mode, Agent mode, parallel execution (p-limit pool), applying a review document | 2.34 | dejabug_task03_parallel_pool_summary.png |
| 4 | ahammadshawki8 | T2.6 REVIEW-01 [BOB] items 0-5,10 (adapter migration, hang handling, sanitizing, true slots) | Plan, Agent | Plan mode, Agent mode, review-driven refactor, terminal execution (lint/test/certify rerun) | 3.21 | dejabug_task04_review01_adapter_summary.png |
| 5 | ahammadshawki8 | T3.3 forger (deja-forger mode, forge-case skill, briefer.ts) | Plan, Agent | Custom mode, Skill, document understanding (PR/issue threads), Bob Shell headless provider, zod validation | 4.00 | dejabug_task05_forger_summary.png, dejabug_task05_forger_prompt.png |
| 6 | ahammadshawki8 | T3.4 case ranking | Agent | 4 explore subagents in parallel, todo list, document understanding of review packs | 1.19 | dejabug_task06_ranking_*.png (todo, subagents running, subagents done, summary, prompt) |
| 7 | ahammadshawki8 | T3.3b forger fixes (REVIEW-T3.3) | Plan, Agent | Plan mode, Agent mode, todo list, skill rewrite, Bob Shell output-format analysis | 14.82 | dejabug_task07_forger_fixes_summary.png |
| 9 | ahammadshawki8 | T5.4 Case Board | Plan, Agent | Plan mode, Agent mode, frontend composition from the design system | 4.43 | dejabug_task09_case_board_summary.png, dejabug_task09_case_board_prompt.png |
| 10 | ahammadshawki8 | T8.1 deja-mentor mode + mentor skill | Agent | Custom mode with read-only permissions (product feature), Skill authoring | 0.732 | dejabug_task10_mentor_mode_summary.png, dejabug_task10_mentor_mode_prompt.png |
| 8 | ahammadshawki8 | T3.6 live Bob Shell headless brief (fc42022) | bob run --mode deja-forger | Bob Shell headless inside the product pipeline, custom mode, skill | (see Bob usage dashboard) | terminal output in PROJECT.md progress log |

## Claude Code / Codex work

Items done by Claude Code or Codex (see PROJECT.md Section 9.1), plus any [BOB] items re-tagged after Bobcoins ran out.

| Date | Item | Tool | Files | Note |
|---|---|---|---|---|
| 2026-09-26 | T0.3-T0.5 | Claude Code | package.json, tsconfig.base.json, eslint.config.js, vitest.config.ts, packages/engine/*, apps/web/*, .env.example, .github/workflows/ci.yml | Scaffold, config, CI |
| 2026-09-26 | T1.2-T1.3 | Claude Code | packages/engine/src/miner.ts, git.ts, cli.ts (mine), miner.test.ts, test/fixture-repo.ts, cases/sarama/candidates.json | Miner + tests |
| 2026-09-26 | Review of T2.1 | Claude Code | docs/reviews/REVIEW-T2.1.md | Review only, no code changes |
| 2026-09-26 | T2.3 | Claude Code | packages/engine/src/store.ts, cli.ts (certify), certifier.test.ts, types.ts (Funnel.attempted, CertificationsFile), .github/workflows/ci.yml (Go) | Store, certify CLI, tests |
| 2026-09-26 | T2.4 support + T2.5 | Claude Code | packages/engine/src/cli.ts (Go preflight), cases/sarama/certifications.json (rerun, path scrub), docs/reviews/REVIEW-01.md | Batch rerun + review |
| 2026-09-26 | T2.5a | Claude Code | packages/engine/src/adapters/*, miner.ts, config.ts, doctor.ts, cli.ts (init, --target), types.ts, tests, cases/fp-go/candidates.json, docs/reviews/REVIEW-01.md item 10 | Repository-agnostic engine |
| 2026-09-26 | T2.7 | Claude Code | packages/engine/src/store.ts (stripLocalPaths), store.test.ts, certifier.test.ts, adapters/go.ts (DEJABUG_TEST_TIMEOUT_SEC), .env.example | REVIEW-01 Claude items |
| 2026-09-26 | T3.1, T3.2, T3.5 | Claude Code | packages/engine/src/github.ts, llm/watsonx.ts, spoiler.ts (+ tests), cli.ts (models) | GitHub context, watsonx client, spoiler guard |
| 2026-09-26 | T3.3 hygiene + spoiler refinement | Claude Code | packages/engine/src/briefer.test.ts (typing/lint only), spoiler.ts, spoiler.test.ts | Keep CI green; fix false positives found by the first real brief |
| 2026-09-26 | T3.4b | Claude Code | packages/engine/src/assemble.ts (+ tests), cli.ts (brief), store.ts (readRanking), test/fixture-repo.ts, docs/reviews/REVIEW-T3.3.md | Case assembly + brief CLI + review |
| 2026-09-26 | T3.6 (Granite part) | Claude Code | packages/engine/src/codenames.ts (+ tests), cli.ts (codenames), scripts/check-cases.mjs, ci.yml, cases/sarama/*.json | 27 case files, unique codenames, data checks |
| 2026-09-26 | T4.1-T4.3 | Claude Code | packages/engine/src/play.ts, verify.ts, forge.ts, server.ts, cli.ts (refactor), types.ts, server.test.ts, cases (testFiles backfill) | Playground, verify, game server |
| 2026-09-26 | T4.4, T4.5 | Claude Code | packages/engine/src/adapters/python.ts (+ tests), adapters/tool.ts, forge.ts (activateToolchain), store.ts (sanitizer), scripts/check-cases.mjs, cases/python-sdk-core/* | Python adapter and second-repo proof |
| 2026-09-26 | T5.1-T5.3 | Claude Code | apps/web/* (scaffold, api client, stores, design system, shell, styleguide, placeholders) | Web foundation and design system |
| 2026-09-26 | T5.4 fixes + T5.5 | Claude Code | apps/web/src/pages/CaseBoardPage.tsx (data-driven precinct tabs, stray footer), CaseFilePage.tsx, components/game/Terminal.tsx (wrap) | Case Board review fixes and Case File |
| 2026-09-26 | T5.6 | Claude Code | apps/web/src/pages/InvestigationPage.tsx, DebriefPage.tsx, components/game/DiffView.tsx, lib/solve.ts (+ tests), styles (diff theme) | Core game loop |
| 2026-09-26 | T5.7 | Claude Code | apps/web/src/pages/SettingsPage.tsx (repo switcher, sound, motion, reset), router.tsx (lazy routes) | States, settings, code splitting |
| 2026-09-26 | T5.8-T5.10 | Claude Code | docs/reviews/REVIEW-02.md; certifier.ts (hang head), briefer.ts (exec), CaseBoardPage, InvestigationPage, DebriefPage | Review and fixes (re-tagged from Bob for coins) |
| 2026-09-26 | T6.1-T6.3 | Claude Code | apps/web/src/lib/badges.ts (+ tests), sound.ts, shareCard.ts, pages/ProgressPage.tsx, DebriefPage.tsx, InvestigationPage.tsx, ArcadeButton.tsx | Gamification |
| 2026-09-26 | T7.0, T7.1 | Claude Code | apps/web/src/pages/ForgePage.tsx, lib/forgeView.ts (+ tests), packages/engine/src/forge.ts (subject relay) | Forge Console and repo picker |
| 2026-09-26 | T8.2 | Claude Code | apps/web/src/components/game/MentorPanel.tsx, InvestigationPage.tsx, packages/engine/src/cli.ts (start) | Mentor panel and CLI start |
| 2026-09-26 | T9.5 (showcase part) | Claude Code | packages/engine/src/showcase.ts, cli.ts (export-showcase), apps/web/src/api/showcase.ts, client.ts, InvestigationPage.tsx, AppLayout.tsx, router.tsx, vite.config.ts, .github/workflows/pages.yml | Static showcase on GitHub Pages |
