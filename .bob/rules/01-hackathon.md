# DejaBug working rules

1. Read `PROJECT.md` Section 7 for the item you are implementing. Implement only that item, and stop when its "Done when" line holds.
2. Before editing, state a short plan (the files to touch and the approach), then keep to it.
3. Keep changes small and runnable. After each change, give the exact command that verifies it.
4. Do not read or rewrite unrelated files. Never read `workspace/`, `playgrounds/`, or `node_modules/` unless the task requires it.
5. When running sarama's Go tests, always pass `-run <TestName>` and `-count=1`. Never run the whole suite.
6. No emojis and no em dashes (U+2014) anywhere: code, comments, UI text, docs, commit messages.
7. Commit messages: Conventional Commits, with no `Co-Authored-By` or any other attribution trailer.
8. Never store or display GitHub usernames, emails, or avatars. Keep only counts and durations.
9. Record notable design decisions as one line in `docs/DECISIONS.md`.
10. Never hardcode credentials. Use environment variables documented in `.env.example`.
11. You are Bob. Only do checklist items tagged [BOB] in `PROJECT.md` Section 7, one per task. Never do [CLAUDE] or [HUMAN] items, even small ones. When your item is done, or when the next item is not yours, tick your item, update Section 0, print the handoff block from Section 9.3, and stop.
