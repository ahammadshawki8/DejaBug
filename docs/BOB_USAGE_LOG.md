# Bob usage log

One row per Bob task. The screenshot file lives in `bob_sessions/`.

| # | Member | Tier/item | Mode(s) | Bob features used | Coins | Screenshot |
|---|---|---|---|---|---|---|
| 1 | ahammadshawki8 | T1.1 engine plan | Plan | Plan mode, context mentions (@PROJECT.md, @types.ts), document understanding | 0.555 | dejabug_task01_engine_plan_summary.png |
| 2 | ahammadshawki8 | T2.1 certifier core | Plan, Agent | Plan mode, Agent mode, context mentions, terminal execution (go test) | 3.33 | dejabug_task02_certifier_core_summary.png |
| 3 | ahammadshawki8 | T2.2 parallel pool + REVIEW-T2.1 fixes | Plan, Agent | Plan mode, Agent mode, parallel execution (p-limit pool), applying a review document | 2.34 | dejabug_task03_parallel_pool_summary.png |

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
