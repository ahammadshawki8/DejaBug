# CLAUDE.md

Instructions for Claude Code (and Codex, which follows the same rules).

**DejaBug** turns a repository's real bug fixes into certified training cases (the fix's test fails 3 out of 3 times before the fix and passes after it) and serves them in a gamified detective web app. New developers solve them in IBM Bob, coached by the read-only Deja Mentor mode. Built solo by **ahammadshawki8** for the IBM Bob 2.0 Hackathon (lablab.ai). Deadline: **Sun 2026-09-27, 8:00 PM BST**.

## Current state (read this first)

- Development is **finished**. Tiers T0 to T10 are ticked, and S.1 to S.3 are done. What is left is S.4: record and upload the video, then submit on lablab. Only fix real bugs from now on; no new features unless the user asks.
- `PROJECT.md` is the project memory: Section 0 (Status), Section 2 (Rules), Section 7 (Checklist), Section 9 (Division of labour and handoff), Section 12 (Progress log). Read those parts before doing anything.
- Public showcase: https://ahammadshawki8.github.io/DejaBug/ (GitHub Pages, rebuilt on every push to `main`).
- Bobcoins: 37.37 of 40 used, about 2.6 left in reserve for the video (a live Deja Mentor chat, a Bob Shell brief). Do not spend them otherwise.

## Working rules

1. Only do items tagged **[CLAUDE]**, plus anything the user asks for directly. Stop at the first [BOB] or [HUMAN] item and print the handoff block from `PROJECT.md` Section 9.3.
2. Never implement [BOB] items (the judged, Bob-native parts) unless `PROJECT.md` re-tags them.
3. Review items (REVIEW-0N): write the review file only, tag each item [BOB] or [CLAUDE], and change no code.
4. When items are done: tick them in Section 7, update Section 0, add a line to Section 12, and list the work under "Claude Code / Codex work" in `docs/BOB_USAGE_LOG.md`.
5. Verify before claiming anything works: run the gate (below), and for UI changes check the page in a browser.

## Rules that always apply

- **Commits:** author and committer are `ahammadshawki8` only. Never add `Co-Authored-By` or any other attribution line to commits or PRs. The team is ahammadshawki8 alone.
- **Style:** no emojis and no em dashes, anywhere (code, UI, docs, commits). `scripts/check-style.mjs` enforces it.
- **Secrets** live only in `.env` (gitignored). Every key is documented, empty, in `.env.example`. Never show `.env` in screenshots or videos. An IBM Cloud key in a public repo gets the account suspended.
- **Personal data:** no GitHub usernames, emails, avatars or local paths (they contain the Windows username) in case data, screenshots or docs. `scripts/check-cases.mjs` checks the case files.
- **Honest claims only:** every number in the README, statements and slides comes from real data (`cases/*/funnel.json`, test runs, the usage log). Do not cite unverified studies or statistics (an unverified study citation was removed on request).
- **Data sources:** every repository, dataset or asset is listed in `docs/DATA_SOURCES.md` with its license. Sounds and the lofi radio are generated in code; no audio files.
- **watsonx models:** never use `llama-3-405b-instruct`, `mistral-medium-2505` or `mistral-small-3-1-24b-instruct-2503`. Briefs use `ibm/granite-4-h-small`.
- **Machine:** memory is tight. Stop dev servers and browsers you start when done, and clean up test playgrounds, sessions and profiles you create.

## Commands

```bash
npm install
npm run dev                       # engine on :4317 (local only) and web on http://localhost:5173
npm run dejabug -- <command>      # engine CLI: doctor, init, mine, certify, brief, start, serve, export-showcase
npm run dejabug -- --target owner/name mine    # any command against another repository
npm run showcase                  # static showcase build (apps/web/dist-showcase)
```

**The gate** (run all before every commit):

```bash
npm run lint && npm run typecheck && npm test && npm run build
npx prettier --check .
node scripts/check-style.mjs && node scripts/check-cases.mjs && node scripts/check-submission.mjs
```

On Windows, Go is at `C:\Program Files\Go\bin`. Shells started before it was installed may not have it on PATH; prepend it, or the Go-dependent tests are skipped (all 106 tests should run, none skipped).

## Where things are

| Path | What |
|---|---|
| `packages/engine/src/` | Node 24 + TypeScript engine: miner, certifier (parallel git worktrees), briefer (watsonx Granite or Bob Shell headless), spoiler guard, playground export, verify, Fastify server with SSE, showcase export |
| `packages/engine/src/adapters/` | Language adapters (Go, Python). Language-specific code lives only here |
| `apps/web/src/` | React + Vite + Tailwind game: pages, `components/game/` design system, `art/` pixel sprites, `lib/` (rules, badges, sounds, lofi radio), `api/` (live engine or bundled showcase) |
| `cases/<repo>/` | Certified cases, one JSON file each, plus candidates, certifications and funnel (sarama 27, python-sdk-core 28, uuid 1) |
| `.bob/` | Bob custom modes (`deja-forger`, `deja-mentor` read-only, `submission-writer`), skills (`forge-case`, `mentor`), rules |
| `bob_sessions/` | Bob task summary screenshots (required submission evidence) |
| `docs/submission/` | Statements (01, 02), short description (03), video script (04), posters, pitch deck PDF |
| `docs/reviews/` | REVIEW-01 to 04 and BOB-REVIEW (Bob's code review) |
| `docs/media/` | README GIF and screenshots |
| `workspace/`, `playgrounds/`, `.dejabug/` | Cloned repositories, exported case playgrounds, local engine state (all gitignored) |

## Things to know

- The engine only accepts requests from this machine (Host and Origin checks, JSON bodies only). It is meant to run locally, never as a public server.
- A certification needs the target language's toolchain. Python repositories use a per-repo virtualenv at `workspace/.venvs/<repo>` when one exists.
- The showcase has no engine: runs replay real recorded results and are labelled as replays. Keep that label honest.
- GitHub Pages returns HTTP 404 for deep links (the SPA fallback page); the app still loads. Share the root URL.
- The pixel sprites in `apps/web/src/art/sprites.tsx` are the source for any artwork (slides, posters).
