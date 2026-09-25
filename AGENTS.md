# AGENTS.md

Context for IBM Bob and any other coding agent working in this repository.

**Read `PROJECT.md` first.** It is the source of truth: features, architecture, the tier-by-tier checklist, rules, and current status.

## Project
- **Name:** DejaBug
- **What it does:** mines a repository's history for real bug fixes and turns each into a certified training case. The test fails on the pre-fix code and passes on the fix. New hires then solve these cases in a gamified web app, coached by a read-only Bob mentor mode.
- **Demo target:** IBM/sarama (Go), cloned into `workspace/sarama` (gitignored).
- **Stack:** Node 24 + TypeScript engine (`packages/engine`), Vite + React + Tailwind game UI (`apps/web`), npm workspaces.
- **Run:** `npm install`, then `npm run dev` (engine server + web).
- **Test:** `npm test` (vitest). Go tests in sarama always use `-run <TestName>`, never the full suite.

## Hard rules
- Implement only the checklist item you were given. Stop when its "Done when" line holds.
- No emojis and no em dashes (U+2014) in any file, UI string, or commit message.
- Never store or display GitHub usernames, emails, or avatars.
- Commit messages must have no `Co-Authored-By` or other attribution trailers.
- Never commit secrets. Use `.env` (gitignored) and document keys in `.env.example`.
