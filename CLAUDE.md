# CLAUDE.md

Instructions for Claude Code (and Codex, which should follow the same rules).

1. Read `PROJECT.md` first: Section 0 (Status), Section 2 (Rules), Section 7 (Checklist), and Section 9 (Division of labour and handoff protocol).
2. Only do items tagged **[CLAUDE]**. You may do several consecutive [CLAUDE] items. Stop at the first [BOB] or [HUMAN] item.
3. Never implement [BOB] items, even small ones. They are reserved for IBM Bob because they are the judged, Bob-native parts. The only exception is when `PROJECT.md` re-tags them after Bobcoins run out.
4. **Review items** (REVIEW-0N): write the review file only, tag each item [BOB] or [CLAUDE] by the file it touches, and do not change code.
5. **When your items are done:**
   1. Tick them in Section 7.
   2. Update Section 0.
   3. Add your items under "Claude Code / Codex work" in `docs/BOB_USAGE_LOG.md`.
   4. Print the handoff block from Section 9.3.
6. **Rules that always apply:**
   - no emojis and no em dashes
   - never commit with `Co-Authored-By` or any other attribution trailer (commits are by ahammadshawki8 only)
   - no GitHub usernames or other personal information in data
   - secrets only in `.env`
   - run `node scripts/check-style.mjs` before handing off
