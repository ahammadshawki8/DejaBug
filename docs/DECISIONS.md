# Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-09-26 | The miner requires the fix keyword in the subject, or in the body unless the subject is a non-fix Conventional Commit type | Bodies carry GitHub closing keywords (Fixes #N). feat/chore commits that mention a fix in passing are noise |
| 2026-09-26 | The miner skips test files with Go build constraints | sarama functional tests need a live Kafka broker. A plain go test never runs them, so they would falsely pass certification |
| 2026-09-26 | mine() returns { candidates, fixLikeCommits, scannedCommits }. CLI writes a CandidatesFile | The funnel needs the counts. Small deviation from ENGINE_PLAN.md, which returned Candidate[] |
| 2026-09-26 | Candidate.packages holds go test args ("." or "./dir") taken from the test files | The certifier can pass them straight to go test |
| 2026-09-26 | Only 23 of 101 candidates have (#N) in the subject. T3.1 should resolve PRs via GET /repos/{o}/{r}/commits/{sha}/pulls | sarama often merges via merge commits |
| 2026-09-26 | Language adapter layer (adapters/). Nothing language-specific outside it | The product must work on any maintained repository (user decision). Go first, Python next |
| 2026-09-26 | The Go adapter runs each package from its nearest go.mod | Multi-module repositories (IBM/fp-go has 3 modules) otherwise fail with setup errors |
| 2026-09-26 | A test that hangs until the per-test timeout counts as the bug reproducing | Deadlock and retry-forever fixes are among the most valuable training cases |
