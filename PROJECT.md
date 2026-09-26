# DejaBug: Project Memory

> This file is the single source of truth for the project. Read it at the start of every session (human, Bob, or Claude). Update the **Status** and **Progress Log** sections at the end of every work session.

---

## 0. Status (update every session)

| Field | Value |
|---|---|
| Current tier | T8 Mentor |
| Next item | T8.3 |
| Next owner | HUMAN |
| Last updated | 2026-09-26 06:15 BST |
| Bobcoins used | 36.23 / 40 (about 3.8 left: T8.3, T9.1) |
| Blockers | none |

---

## 1. Hackathon facts

- **Event:** IBM Bob 2.0 Hackathon (lablab.ai), online.
- **Hard deadline:** Sun Sep 27 2026, **8:00 PM BST** (10 AM ET, per the IBM account page. lablab shows 9:00 PM, and we plan for the earlier one). The watsonx cloud account closes at the same moment.
- **Our budget:** 40 hours = **35 h development** (Fri 11 PM to Sun 10 AM) + **5 h submission** (Sun 10 AM to 3 PM). Everything after that is buffer.
- **Team:** ahammadshawki8.
- **Repository:** https://github.com/ahammadshawki8/DejaBug (public, MIT).
- **Judging:** Application of Technology, Presentation, Business Value, Originality.
- **Hard requirements** (missing any one of these can disqualify us):
  - Bob IDE is a core part of the solution.
  - `bob_sessions/` contains PNG task-summary screenshots from each member.
  - Problem & Solution statement and Bob Usage statement are each 500 words or less.
  - Video is MP4, 3:00 or less, with at least 90 s of the product working and narration.
  - Repo is public with an MIT license.
  - No personal, client, confidential, or social-media data. Every public source is listed in `docs/DATA_SOURCES.md`.
- **Pre-submit check:** `node scripts/check-submission.mjs` and `node scripts/check-style.mjs`.

---

## 2. Rules (must be followed for the whole project)

1. **Commit identity.** Every commit is authored and committed by `ahammadshawki8`, and nobody else. Never add `Co-Authored-By` trailers, and never list Claude, Bob, srotdev, or any bot as author, committer, collaborator, or contributor. Bob's generated commit messages must be checked for trailers before committing. Before every push, run `git log --format='%an <%ae> | %cn <%ce>%n%b' origin/main..HEAD` and confirm.
2. **No emojis and no em dashes (U+2014)** anywhere in the project: code, comments, docs, UI text, commit messages, slides. Use a plain hyphen or a colon instead. `scripts/check-style.mjs` enforces this.
3. **No personal information in case data.** GitHub usernames, emails, and avatars from issues and PRs are never stored or shown. Store only counts, durations, and redacted text.
4. **Ownership is explicit.** Every checklist item is tagged [BOB], [CLAUDE] (Claude Code or Codex), or [HUMAN]. Agents only do their own items and hand off with the protocol in Section 9.3.
5. **One [BOB] item per Bob task.** Each Bob task gets a PNG summary screenshot saved to `bob_sessions/` as soon as it finishes.
6. **Keep this file current.** Tick checklist boxes, update Status, and append to the Progress Log after each work session.
7. **Secrets** (GitHub token, API keys) live only in `.env`, never in git. `.env.example` documents them.
8. **Working software over breadth.** A tier is done only when its "Done when" line is demonstrably true. Never start the next tier with the current one broken.
9. **The frontend must feel like a game**, not an admin panel (see Section 6).
10. **Repository-agnostic.** DejaBug must work on any well-maintained repository with a test suite, not only sarama. No language- or repo-specific literals (`go test`, `_test.go`, `IBM/sarama`) outside `packages/engine/src/adapters/` and config defaults. sarama is only the demo target.

---

## 3. The pitch

**One-liner:** *Pilots train on replays of real incidents. Your new hires train on your team's real bugs.*

**Problem.**
- New engineers take months to become productive, and 67% say their first production-ready contribution took over 4 weeks.
- AI assistants make it worse for the skill that matters most. In Anthropic's 2026 randomized study, developers who learned with AI scored 17% lower on mastery, and **the largest gap was debugging**. Developers who used AI to understand, not to produce, kept their learning.
- Meanwhile every repository holds a perfect, unused curriculum: hundreds of real bugs, each with a known fix and a test that proves it.

**Solution.** DejaBug mines a repository's history for real bug fixes and turns each one into a **certified training case**:
1. Restore the code as it was just before the fix.
2. Add the fix's own test.
3. Prove that the test fails on the buggy code and passes on the real fix.

Bob turns each fix's PR and issue thread into a spoiler-free case file. The new hire then debugs the real bug in Bob IDE, coached by a **read-only Bob Mentor mode that physically cannot write the fix**. They earn XP, ranks, and badges. At the end they get a debrief comparing their fix and time with the original team's.

**Works on any repository with tests.** A language adapter layer (Go first, then Python) detects the repo's language, finds its tests, runs them, and classifies the results. `dejabug init <owner/repo>` onboards a new repository in one command. Each repository gets its own `cases/<name>/`.

**Primary demo repository:** [IBM/sarama](https://github.com/IBM/sarama), a Go client for Apache Kafka (12.5k stars, MIT license).
- Measured by `dejabug mine` on 2026-09-26: 2,889 commits, 703 fix-like, and **101 runnable candidates** that change tests plus 1-3 source files. Commits whose only test changes are in sarama's `functional` tests are excluded, because those need a live Kafka broker.
- Go modules make historical snapshots build reliably.

**Why it wins:**
- **Originality:** SWE-bench-style replay is used to benchmark AI models. We point it at onboarding humans, and we found no existing product that does this.
- **Proof:** every case is verified fail-then-pass, so nothing is guessed.
- **Bob-native:** parallel case forging, subagents, document understanding of PR and issue threads, a custom mode with restricted permissions, and Bob Shell headless runs inside the pipeline.

---

## 4. Features

### 4.1 Engine (CLI + local server)
- **F0 Onboard.** `dejabug init <owner/repo | url>` clones into `workspace/<name>` and detects the language adapter (`go.mod` means Go, `pyproject.toml`/`setup.py`/`pytest.ini` means Python). The toolchain is checked by `dejabug doctor`. Every command takes `--target <owner/name>`.
- **F1 Mine.** Scan `git log` for fix-like commits. Keep those that change the adapter's test files plus 1 to 3 source files. (For Go these are `_test.go` files.) Record the PR number from the commit message. Output a candidate list with metadata.
- **F2 Certify.** For each candidate, in parallel isolated worktrees:
  1. Check out the parent commit.
  2. Overlay the fix commit's test files.
  3. Detect which test functions were added or changed.
  4. Run them 3 times. They must **fail** every time with a test failure, not a build failure.
  5. Overlay the fix's source files and run again. They must **pass**.

  Each candidate gets one status: `certified`, `rejected:build`, `rejected:no-fail`, `rejected:flaky`, `rejected:no-pass`, or `rejected:timeout`. The funnel counts are persisted.
- **F3 Brief (Bob).** For each certified case, fetch the PR and linked issue text through the GitHub REST API. Then call `bob run --format json --mode deja-forger` to produce a case file:
  - codename
  - symptom report written like a user report
  - evidence snippet
  - 3 tiered hints (nudge, direction, near-answer)
  - difficulty 1 to 3
  - precinct (code area)
  - lesson learned
  - tags

  The output is validated with a schema, with one retry.
- **F4 Spoiler guard.** Reject or regenerate any brief that contains identifiers or literals introduced by the fix diff.
- **F5 Original effort.** From the GitHub API: time from issue opened to PR merged, comment count, and review rounds. Counts only, no usernames.
- **F6 Play export.** `dejabug start <case>` exports a clean playground:
  - It contains the snapshot at the parent commit plus the fix's tests, as a fresh git repo with **no future history**, so the answer can't be peeked at.
  - It includes an `AGENTS.md` telling Bob this is a training case, and the `deja-mentor` mode.
- **F7 Verify.** Run the case's tests in the playground and return pass/fail with the parsed failing test names and output.
- **F8 Reveal.** Return the original fix diff, the player's diff, the lesson, and the original-effort stats.
- **F9 Local server.** A REST API plus SSE progress events for forge runs. It serves the web app.

### 4.2 Web app (gamified)
- **W1 Case Board.** A detective cork board of case cards: codename, difficulty stars, precinct, "cold for N days" (age of the bug), and a locked/solved state.
- **W2 Case File.** The symptom report, evidence, precinct, par time, and a "Take the case" button that exports the playground and shows its path.
- **W3 Investigation screen.** A live timer, a hint ladder (each hint costs XP and needs a confirmation), a "Run the tests" button with animated pass/fail, and an "Ask the Mentor" panel explaining how to open the case in Bob IDE with Deja Mentor mode.
- **W4 Debrief.** A case-closed stamp animation, "You: 11m 32s, 1 hint" against "Original team: 3 days, 41 comments", a side-by-side diff (yours vs theirs), the lesson learned, and XP gained.
- **W5 Progression.** XP, ranks (Rookie, Detective, Inspector, Chief Inspector, Commissioner), badges, streak, and a mastery ring per precinct.
- **W6 Forge Console.** A live view of the pipeline: parallel worker lanes, each candidate moving through mine, certify, and brief with a status, plus an animated funnel (703 fix commits, 101 candidates, N certified). This is the "Application of Technology" moment in the video.
- **W7 Showcase mode.** A static build deployed publicly with bundled, pre-forged cases. Verification results in showcase mode are replays of real recorded local runs and are labeled as such.

### 4.3 Bob-native pieces (shipped in the repo)
- **B1** `.bob/custom_modes.yaml`: `deja-forger` (read-only, writes case JSON only) and `deja-mentor` (read-only: can read code and run nothing, Socratic, never writes the fix).
- **B2** `.bob/skills/forge-case/SKILL.md`: instructions and the JSON schema for writing a spoiler-free case file.
- **B3** `.bob/skills/mentor/SKILL.md`: the coaching method (ask, point, never patch).
- **B4** The playground `AGENTS.md` template that tells Bob it is inside a training case.

---

## 5. Architecture

```mermaid
flowchart LR
  subgraph Engine["packages/engine (Node 24, TypeScript)"]
    M[Miner] --> C[Certifier pool]
    C --> B[Briefer]
    B --> S[(cases/*.json)]
    G[GitHub API] --> B
    B -->|bob run --mode deja-forger| BOB[Bob Shell]
    P[Play exporter] --> PG[(playgrounds/)]
    V[Verifier] --> PG
    API[Fastify REST + SSE]
  end
  R[(workspace/sarama)] --> M
  R --> C
  S --> API
  API <--> W[apps/web React game UI]
  PG --> IDE[Bob IDE + deja-mentor mode]
```

**Language adapters** (`packages/engine/src/adapters/`). One interface, `LanguageAdapter`:
- `detect(repoDir)`
- `isTestFile` / `isSourceFile` / `isRunnableTestFile` (for example, excluding Go build-tagged files)
- `testsTouched(diff)` and `testTargets(testFiles)`
- `runTests(dir, targets, tests)`, which returns `pass | fail | hang | build | notest` plus the failing test names; it throws `ToolMissingError` or `TimeoutError`
- `toolCheck()`

The miner, certifier, and verifier call only this interface.

**Stack**
- Engine: Node 24, TypeScript, `tsx`, `commander`, `execa`, `fastify`, `zod`, `p-limit`, `vitest`.
- Web: Vite, React 18, TypeScript, Tailwind CSS, Framer Motion, Zustand, `pixelarticons`, `@fontsource/*` (Silkscreen, Special Elite, IBM Plex Sans/Mono), `canvas-confetti`, `diff2html` for diffs, WebAudio sound effects. Full visual spec: Section 6A.
- Target toolchain: Go 1.22 or later (for sarama tests).
- Monorepo: npm workspaces.

**Directory layout**
```
DejaBug/
  PROJECT.md  AGENTS.md  README.md  LICENSE
  .bob/  custom_modes.yaml  rules/  skills/
  packages/engine/src/  miner.ts certifier.ts briefer.ts spoiler.ts github.ts
                        play.ts verify.ts server.ts cli.ts store.ts types.ts
  apps/web/src/         pages/ components/ game/ api/ sounds/
  cases/sarama/         <sha>.json (committed, pre-forged)  funnel.json
  workspace/            (gitignored) sarama clone, worktrees
  playgrounds/          (gitignored) exported cases
  docs/  reviews/ submission/ DATA_SOURCES.md DECISIONS.md BOB_USAGE_LOG.md
  bob_sessions/  scripts/
```

**Case JSON (contract between engine and web)**
```ts
type Case = {
  id: string;              // short sha of fix commit
  repo: "IBM/sarama";
  fixSha: string; parentSha: string; prNumber?: number;
  status: "certified";
  tests: string[];         // Go test names
  packages: string[];      // go packages to test
  certification: { failRuns: number; passRuns: number; failOutput: string; passOutput: string; durationMs: number };
  brief: { codename: string; symptoms: string; evidence: string; hints: [string, string, string];
           difficulty: 1 | 2 | 3; precinct: string; lesson: string; tags: string[] };
  original: { daysOpen?: number; comments?: number; reviewRounds?: number; mergedAt: string };
  bugAgeDays: number;      // commit date of fix minus date the buggy code was introduced (approx)
  parSeconds: number;
  fixDiff: string;         // revealed only in debrief
};
```

**REST API**
- `GET /api/cases`
- `GET /api/cases/:id` (no fixDiff)
- `POST /api/cases/:id/start`
- `POST /api/cases/:id/verify`
- `POST /api/cases/:id/hint/:n`
- `GET /api/cases/:id/reveal` (only after a pass, or after giving up)
- `GET /api/funnel`
- `POST /api/forge` + `GET /api/forge/events` (SSE)
- `GET/PUT /api/profile`

**Key decisions** (details in `docs/DECISIONS.md`):
- The playground is exported with `git archive` into a fresh repo, so there is no future history and no answer peeking.
- Cases are pre-forged and committed, so the demo is deterministic and live runs spend no Bobcoins.
- A certified case needs 3 of 3 failing runs, which rejects flaky race tests.

---

## 6. Game design

- **Theme:** a cold-case detective agency. Palette: dark navy, case-file manila, stamp red, neon amber accents. Typewriter font for briefs, bold display font for headings.
- **Core loop:** pick a case, read the file, investigate in Bob IDE, run the tests, close the case, then debrief and earn XP. This unlocks harder cases.
- **XP:** base 100 / 200 / 300 by difficulty. Each hint costs 25% of base. A time bonus of up to +50% applies when under par. A no-hint solve gets a x1.2 multiplier.
- **Ranks:** Rookie 0, Detective 300, Inspector 900, Chief Inspector 2000, Commissioner 4000.
- **Badges:**
  - Cold Case Closed (first solve)
  - Clean Hands (no hints)
  - Beat the Clock (under par)
  - Race Hunter (concurrency tag)
  - Protocol Whisperer (3 protocol cases)
  - Precinct Master (all cases in one precinct)
  - Faster Than The Original (solve time under 1% of the original fix time)
- **Feel:** stamp and paper-slide animations, a typewriter reveal of the symptoms, a red/green terminal for test runs, confetti plus a CASE CLOSED stamp on success, and subtle sound effects with a mute toggle.
- **Accessibility:** keyboard navigable, sufficient contrast, and `prefers-reduced-motion` respected.

---

## 6A. Frontend design directive (binding for T5-T7)

Read this section, Section 4.2, and Section 6 before designing or changing any screen. If this section conflicts with a default habit, this section wins. Do not redesign functionality. Design the presentation and interaction around the functionality described in this file.

**The 3-second test:** someone seeing any screen for 3 seconds should think "developer debugging game / detective investigation", not "project-management dashboard".

### 6A.1 What we take from the reference screenshots (and what we do not)
- References live in `screenshots_inspired/`. They are local only, gitignored, and never shipped (third-party designs).
- **Take:**
  - thick dark outlines (3 px) with **hard offset shadows** (no blur)
  - flat, saturated color blocks
  - pixel-art icons
  - a ribbon-banner page title with an arrow tail
  - chunky stat tiles
  - a bold colored header bar on data blocks
  - pixel-bordered progress bars with the value printed inside
  - collectible cards for achievements
  - an arcade-style pop-up modal (the leaderboard)
  - a persistent left icon rail whose active item is a solid color block
  - dense but clean information blocks
- **Do not take:** their purple/yellow/blue palette, their layout, the "workspace/task manager" framing, generic bar charts, or photo avatars.

### 6A.2 Principles
- **Design, do not default.** No typical SaaS/admin dashboard, generic card grids, gradients, glassmorphism, shadcn or Material look, or large border radii. It is a game interface first and a developer tool second.
- **Tactile.** The UI is built from physical detective objects, stylized and clean, never photorealistic:
  - manila case folders and dossier tabs
  - evidence sheets and clipped notes
  - cork-board case cards with pins, and string where it carries meaning
  - stamped documents and police-file labels
  - terminal readouts
  - worn paper edges
- **Hierarchy through color.** Dark navy is the environment. Manila and off-white are case-file surfaces. Stamp red means danger, failure, or a key action. Neon amber means interactive, highlight, or XP. Restrained green is only for verified/pass states. No rainbow colors.
- **Dense but clean.** Strong borders, deliberate spacing, compact information blocks, and large focal elements. No giant empty areas and no marketing-site hero typography.
- **Every decoration has a gameplay purpose.** No stock illustrations, no emoji icons, no decorative noise.
- **Progression is always visible** (rank, XP, streak live in the shell) and is never reduced to plain text statistics.

### 6A.3 Design tokens (define once in `tailwind.config.ts` and `src/styles/tokens.css`; never hardcode hex values in components)

| Token | Value | Use |
|---|---|---|
| `ink` | `#0B1426` | App background (navy environment) |
| `navy` | `#14223F` | Rail, dark panels, terminal frame |
| `navy-2` | `#1E3159` | Raised dark surfaces, hover |
| `line` | `#05080F` | All outlines and hard shadows |
| `manila` | `#E8D49B` | Case folders, cards |
| `paper` | `#F7F1E1` | Documents, evidence sheets, dossier pages |
| `cork` | `#B98A5A` | Case board surface (CSS pattern, no images) |
| `stamp` | `#D7263D` | Fail, danger, primary irreversible actions, CASE CLOSED |
| `amber` | `#FFB627` | Interactive highlight, XP, active nav, focus ring |
| `pass` | `#2FA84F` | Verified, tests passing |
| `muted` | `#8A93A6` | Secondary text on dark |
| `text-dark` | `#1A1A1A` | Text on paper/manila |

- **Outline:** `3px solid line`. **Shadow:** `4px 4px 0 line` (hard, no blur). **Pressed:** translate `2px 2px` and shadow `2px 2px 0 line`. **Radius:** 2 px (4 px max). Contrast must reach WCAG AA on every surface.

### 6A.4 Typography (self-hosted via `@fontsource/*` so the demo works offline)
- **Display / headings / labels:** `Silkscreen` (pixel). Use it for short strings only: page ribbons, codenames, stamps, button labels, stat labels.
- **Case reports and evidence:** `Special Elite` (typewriter).
- **Body and UI text:** `IBM Plex Sans`.
- **Numbers, timer, terminal, code:** `IBM Plex Mono` (tabular numerals).
- **Never** set paragraphs in the pixel font. Body copy stays 15 to 16 px and highly legible.

### 6A.5 Icons and art
- UI icons come from `pixelarticons` (MIT) as React components. Never use emoji.
- Rank insignias (5), badge art (7), precinct seals, the cork pin, the stamp, and the paper clip are **custom pixel SVGs** drawn on a 16x16 or 32x32 grid and kept in `apps/web/src/art/`.

### 6A.6 Game shell (every screen)
- **Left rail (80 px, navy):** Case Board (board icon), Investigation (magnifier), Forge (hammer/zap), Progress (trophy), and Settings (sliders) at the bottom. The active item is a solid amber block with an ink icon, as in the references. Tooltips appear on hover and focus.
- **Top bar:**
  - a ribbon-banner page title in stamp red with an arrow tail
  - on the right: rank insignia, a compact XP bar ("1,240 / 2,000 XP"), streak counter, mute toggle, and an engine status light (green = engine connected, amber = showcase mode)
- **Dispatch ticker** (thin line above the ribbon, like the references' "quote of the day"): rotating one-line lessons from solved cases, which gives the ticker a teaching purpose.

### 6A.7 Screens
**Case Board (the hero, W1).**
- The board is a cork surface (CSS pattern), not a table or card grid.
- Cases are pinned manila folders in a loose grid with slight random rotation (-2 to 2 degrees, seeded by case id so it is stable).
- Above the board, a strip of chunky stat tiles: Open cases, Closed, Best time, Current rank.
- Precinct filters are dossier tabs: All, Producer, Consumer, Protocol, Client, Admin.
- Each folder shows:
  - codename in the pixel font
  - precinct on the folder tab
  - difficulty as 1 to 3 magnifier pips
  - "COLD FOR 1,204 DAYS" as a stamped label
  - reward chip "+300 XP" in amber
- Four distinct states:
  - **Locked:** desaturated, padlock, diagonal "LOCKED: REACH DETECTIVE" tape.
  - **Available:** manila, lifts on hover.
  - **Active:** amber outline, pulsing pin, "IN PROGRESS" clip.
  - **Solved:** red CASE CLOSED stamp overlay, best time shown.
- On hover, a red string links cases in the same precinct.

**Case File (W2).**
- Opening a case plays a folder-opening transition into a two-page dossier.
- **Left page:** the symptom report revealed with a typewriter animation (click or press Space to finish instantly), then an evidence sheet with a paper clip holding a terminal readout of the redacted failing test output.
- **Right page:** "MISSION PARAMETERS" as game information, not form fields: precinct seal, difficulty pips, par time, reward, tests to pass, and bug age.
- **TAKE THE CASE** is a large stamp-red button. After it is pressed, it shows the playground path with a copy button and three steps: open in Bob IDE, switch to Deja Mentor mode, investigate.

**Investigation (W3).**
- The focal elements are:
  - a huge live timer in Plex Mono, with a par marker that turns stamp red when exceeded
  - the current objective ("Make TestProducerRetry pass")
  - a remaining-XP meter that visibly drains with time and hints
- **Hint ladder:** 3 sealed envelopes stacked vertically, each labeled with its cost ("-75 XP"). Opening one needs a confirmation. An opened hint becomes a clipped note.
- **RUN TESTS** is a major arcade button: amber, deep press animation, shortcut `R`.
- **Fail sequence:** the terminal types red lines, the status reads "SUSPECT STILL AT LARGE", and there is a short shake (skipped under reduced motion).
- **Pass sequence:** green "VERIFIED" lines, then an automatic transition to the Debrief.
- A small, secondary "Give up and reveal" action awards 0 XP.

**Debrief (W4).**
- The CASE CLOSED stamp slams in (scale 2 to 1, rotate -8 degrees, about 220 ms, one-frame screen jolt).
- The XP counter rolls up, then time and hints used appear.
- Newly unlocked badges flip in as collectible cards.
- The rank bar fills, and the rank-up modal appears if a threshold is crossed.
- Then a fighting-game style **VS panel**, "YOUR INVESTIGATION vs ORIGINAL TEAM":
  - left: your time, hints, lines changed
  - right: days open, comments, review rounds
- Then the side-by-side diff (diff2html restyled to the tokens) and the lesson on an index card.
- Actions: Share card (PNG), Next case.
- Confetti fires only on rank-up or the first solve.

**Progress (W5).**
- A large rank insignia and a rank ladder path with 5 nodes, Rookie -> Detective -> Inspector -> Chief Inspector -> Commissioner.
- The XP bar with the next rank.
- A badge collection of collectible cards, with locked badges shown as silhouettes with their unlock hint.
- Precinct mastery as segmented pixel rings.
- A streak calendar of pixel squares, and closed cases as a file drawer list.
- An arcade leaderboard modal inspired by the reference. It shows local player profiles only, never real names from GitHub.

**Forge Console (W6, key demo moment).**
- **Funnel:** three large counters connected by arrows, FIX COMMITS 703 -> CANDIDATES 101 -> CERTIFIED N. Each ticks up as events arrive.
- **Worker lanes:** 4 to 8 horizontal conveyor belts. Each lane shows its current candidate chip (short sha + commit subject) moving through three stations: MINE, CERTIFY (with fail-run lights 1/2/3 and a pass light), and BRIEF (with a "Bob is writing" indicator).
- **Outcomes:** certified cases drop into an "Evidence Locker" tray on the right as new folders. Rejected candidates fall into a discard bin with a reason tag (build, flaky, no-fail).
- **Controls:** a terminal log ticker along the bottom, a "Forge 8 cases" button, and a concurrency selector.
- It must read as parallel activity instantly, even to someone who does not know the implementation.

**Settings.** Sound on/off and volume, a reduced-motion override, reset profile (with confirmation), engine connection details, and a showcase-mode notice.

**States everywhere, all themed:**
- **Loading:** paper sliding in.
- **Empty board:** "No open cases. Fire up the Forge."
- **Engine offline:** "Radio silence from HQ", with a retry button.
- **Errors:** a stamped memo with the message and a retry button.

### 6A.8 Motion (Framer Motion)
- UI feedback takes 120 to 200 ms. Paper slides take 300 to 400 ms. The stamp impact takes about 220 ms with a slight overshoot. Counters and progress fills take 500 to 700 ms.
- Animations never block input, and repeated actions are never slowed down.
- Micro-interactions:
  - buttons depress 2 px
  - folders lift 2 to 4 px on hover
  - stamps hit with weight
  - XP counts upward
  - progress fills smoothly
  - newly unlocked items get a brief amber highlight
- Under `prefers-reduced-motion` or the Settings override, everything becomes an opacity fade: no shake, no rotation, no confetti.

### 6A.9 Sound (WebAudio, synthesized, no audio files)
- Sounds: click (short square blip), stamp (low noise thump), fail (descending buzz), pass (ascending 3-note arpeggio), rank-up (4-note fanfare).
- Master gain 0.3. Starts after the first user gesture. The mute state persists, and the mute toggle is always visible in the top bar.

### 6A.10 Component inventory (`apps/web/src/components/game/`)
- **Shell:** `GameShell`, `NavRail`, `RibbonTitle`, `DispatchTicker`.
- **Surfaces:** `StatTile`, `PaperPanel`, `DarkPanel`, `DossierTabs`, `Modal` (arcade), `Toast` (clipped note), `Tooltip`.
- **Cases:** `CaseFolder`, `Stamp`, `TypewriterText`, `Terminal`.
- **Controls:** `ArcadeButton`, `IconButton`.
- **Progression:** `XpBar`, `RankInsignia`, `BadgeCard`, `MasteryRing`, `StreakCalendar`.
- **Investigation:** `HintLadder`, `Timer`, `VersusPanel`.
- **Forge:** `WorkerLane`, `FunnelCounter`.

Every screen is composed from these. No page-specific one-off styling.

### 6A.11 Stack and rules
- React 18, TypeScript, Tailwind CSS, Framer Motion, Zustand, `pixelarticons`, `@fontsource/*`, `canvas-confetti`, `diff2html`.
- No emojis and no em dashes in UI text or source. Use icon components.
- Accessibility:
  - full keyboard navigation (`R` runs tests, `H` opens the next hint, `Esc` closes modals)
  - visible amber focus rings
  - AA contrast
  - `aria-live` announcements for test results and XP gains
  - reduced motion respected

### 6A.12 Procedure for Bob (before editing frontend code)
1. Inspect the existing `apps/web` structure.
2. Read Sections 4.2, 6, and 6A.
3. Define or extend the tokens and the shared components first.
4. State briefly what you intend to change.
5. Implement consistently across the affected screens.
6. Check the 3-second test and the states list before declaring done.

## 7. Implementation checklist (tier by tier)

Hour estimates add up to 35. "M" marks a milestone that triggers a Claude review.

**Every item has an ID and exactly one owner:**
- **[BOB]:** done by IBM Bob, one item per Bob task (Section 9). These are the judged, visible, Bob-native parts.
- **[CLAUDE]:** done by Claude Code or Codex. This is the plumbing.
- **[HUMAN]:** done by you: an account, a command to run, a screenshot, or a decision.

Work always proceeds top to bottom. Follow the handoff protocol in Section 9.3.

### T0 Setup (1 h), target Fri 11:59 PM
- [x] T0.1 [HUMAN] Install Go (`winget install GoLang.Go`) and verify `go version`. Installed go1.27.0.
- [x] T0.2 [HUMAN] Clone IBM/sarama into `workspace/sarama` (gitignored). `go test -run TestAsyncProducer -count=1 .` passes: about 30 s the first time, about 1 s after.
- [x] T0.3 [CLAUDE] Scaffold npm workspaces `packages/engine` and `apps/web`: shared tsconfig, eslint, prettier, vitest, and the dev scripts (`npm run dev`, `build`, `test`, `lint`, `typecheck`).
- [x] T0.4 [CLAUDE] `.env.example` with `GITHUB_TOKEN`, `DEJABUG_REPO_DIR`, `LLM_PROVIDER` (`watsonx` or `bob`), `WATSONX_API_KEY`, `WATSONX_PROJECT_ID`, `WATSONX_URL`, `WATSONX_MODEL_ID`, `BOB_MAX_COST`.
- [x] T0.5 [CLAUDE] GitHub Actions CI: lint, typecheck, unit tests, `check-style.mjs`.
- [ ] **Done when:** `npm run build && npm test` passes locally and on CI.

### T1 Engine plan + Miner (2 h), target Sat 2:00 AM
- [x] T1.1 [BOB] **Plan mode task:** design the engine modules (miner, certifier, briefer, spoiler, play, verify, server) against Sections 4.1 and 5. Save the plan as `docs/ENGINE_PLAN.md`. This is cheap, and it is our "Plan mode" evidence.
- [x] T1.2 [CLAUDE] `miner.ts`: fix-like commit filter, file classification, PR number extraction, changed test function detection, and the `dejabug mine` CLI command.
- [x] T1.3 [CLAUDE] Miner unit tests on a fixture git repo.
- [x] **Done when:** `dejabug mine --repo workspace/sarama --out cases/sarama/candidates.json` outputs 150 or more candidates in under 30 s. **Result: 101 candidates in 10 s.** The 150 target was a pre-measurement estimate. The shortfall is sarama's broker-only functional tests (55 commits), which can never be certified locally. 101 is ample for the 12-case target (see docs/DECISIONS.md).

### T2 Certifier (4 h), target Sat 6:00 AM, **M1**
- [x] T2.1 [BOB] `certifier.ts` core: worktree lifecycle, test overlay from the fix commit, go test runner with timeout, output parsing (build failure vs test failure), the 3-run fail rule and 1-run pass rule, and every rejection status.
- [x] T2.2 [BOB] Parallel certification pool (default concurrency 4) with a typed progress event emitter. This is our "parallel" evidence.
- [x] T2.3 [CLAUDE] `funnel.json` writer, the `dejabug certify --limit N` CLI command, and certifier unit tests.
- [x] T2.4 [HUMAN] Run `dejabug certify --limit 40` and commit the results.
- [x] T2.5 [CLAUDE] **Review #1:** write `docs/reviews/REVIEW-01.md`, with each item tagged [BOB] or [CLAUDE] by the file it touches. No code changes.
- [x] T2.5a [CLAUDE] **Repository-agnostic engine:** `adapters/` (interface, errors, registry, Go adapter with the REVIEW-01 item 1 and 4 output classification), the miner refactored onto the adapter, `Candidate.language`, `dejabug init <owner/repo>`, and a global `--target` option. Update the engine tests.
- [x] T2.6 [BOB] Apply the [BOB] items of REVIEW-01 in one task, and make `certifier.ts` call `adapter.runTests()` (no Go literals left in the certifier).
- [x] T2.7 [CLAUDE] Apply the [CLAUDE] items of REVIEW-01.
- [x] **Done when:** 12 or more certified sarama cases exist with recorded fail and pass output. **Result: 23 certified of 44 attempted.**

### T3 Briefs (3 h), target Sat 9:00 AM
- [x] T3.1 [CLAUDE] `github.ts`: PR, linked issue, and comments fetch with an ETag cache and username/email/avatar stripping. Original-effort stats (days open, comments, review rounds).
- [x] T3.2 [CLAUDE] `llm/watsonx.ts`: a watsonx.ai text-generation client (IAM token exchange, Granite model from `WATSONX_MODEL_ID`, JSON output). Never use the models the hackathon bans (Section 9.8).
- [x] T3.3 [BOB] **The forger:**
  - the `deja-forger` custom mode in `.bob/custom_modes.yaml`
  - `.bob/skills/forge-case/SKILL.md` (brief schema, spoiler rules, hint ladder method)
  - `briefer.ts`: prompt built from the skill, provider switch (`watsonx` for batch, `bob` = `bob run --format json --mode deja-forger --max-cost`), zod validation, one retry
- [x] T3.4 [BOB] **Subagent task:** "Use explore subagents in parallel to inspect the certified cases and rank them by teaching value and difficulty; write `cases/sarama/ranking.json`." This is our "subagents" evidence.
- [x] T3.5 [CLAUDE] (done early so that Bob's briefer can call it) `spoiler.ts`: extract identifiers and literals from the fix's added lines and reject briefs that contain them. Includes tests.
- [x] T3.4b [CLAUDE] `dejabug brief` CLI: for each certified case, fetch GitHub context and original effort, build the source-only fix diff, call Bob's `brief()`, then assemble and write the Case JSON (id, language, parSeconds, bugAgeDays, certification, redacted outputs).
- [x] T3.3b [BOB] Apply docs/reviews/REVIEW-T3.3.md (skill examples copied into briefs, codename rules, JSON retry, client reuse, bob provider on Windows).
- [x] T3.6 [HUMAN] Generate briefs: Granite for all certified cases (**done, 27/27**), plus `--provider bob` for 1 showcase case (**done: fc42022 "The Overflowing Slice", written by Bob Shell headless in 18.7 s**). Commit the case JSON.
- [x] **Done when:** 12 or more cases have valid, spoiler-free briefs in `cases/sarama/`. **Result: 27 case files (Granite, 47 s), unique codenames, and scripts/check-cases.mjs passes in CI.**

### T4 Game server + play/verify (3 h), target Sat 12:00 PM
- [x] T4.1 [CLAUDE] `play.ts`: `git archive` export, test overlay, fresh `git init`, the playground `AGENTS.md` template, and a copy of the `deja-mentor` mode.
- [x] T4.2 [CLAUDE] `verify.ts`: run the case's tests in the playground and parse the results.
- [x] T4.4 [CLAUDE] **Python adapter** (pytest): test files `test_*.py`/`*_test.py`, test names from `def test_*` diffs, targets `file::name`, output classification, and the `.venv` toolchain check. Tests on a Python fixture repo.
- [x] T4.5 [HUMAN, done by Claude at the human's request] Prove the product is generic: `dejabug init` + `mine` + `certify` on a second, Python IBM repository. Record the funnel for the video and README.
- [x] T4.3 [CLAUDE] `server.ts`: all REST endpoints plus SSE forge events (Section 5). Reveal stays locked until a pass or a give-up.
- [x] **Done when:** an end-to-end run through curl works: start, apply the real fix by hand, verify passes, reveal works. **Verified: real fixes applied to fc42022 (fail to pass) and 66e60c7 (hang to pass). curl on the live server: 27 public cases with no spoilers, start plus verify reports the real failing tests. The server integration test covers the full loop.**

### T5 Web core (6 h), target Sat 6:00 PM, **M2**
- [x] T5.1 [CLAUDE] Web app scaffold: Vite + React + Tailwind + Framer Motion + Zustand, routing, the typed API client, and the game state store.
- [x] T5.2 [CLAUDE] (re-tagged: coins) **Design system:** tokens, fonts, icons, custom pixel art, and the full component inventory (6A.3-6A.5, 6A.10), shown on a `/styleguide` route.
- [x] T5.3 [CLAUDE] Game shell (6A.6) built from the Bob components.
- [x] T5.4 [BOB] **Case Board**, the hero screen (6A.7 W1).
- [x] T5.5 [CLAUDE] Case File dossier (6A.7 W2).
- [x] T5.6 [CLAUDE] (re-tagged: coins) **Investigation + Debrief**, the core game loop (6A.7 W3 and W4).
- [x] T5.7 [CLAUDE] Themed loading, empty, and error states, keyboard shortcuts, and reduced motion (6A.7, 6A.8, 6A.11).
- [x] T5.8 [CLAUDE] **Review #2:** write `docs/reviews/REVIEW-02.md` with tagged items.
- [x] T5.9 [CLAUDE] (re-tagged: coins) Apply the REVIEW-02 items.
- [x] T5.10 [CLAUDE] Apply the [CLAUDE] items of REVIEW-02.
- [ ] **Done when:** a full case can be played in the browser against the local engine, and the screens pass the 3-second test.

### T6 Gamification (4 h), target Sat 10:00 PM
- [x] T6.1 [CLAUDE] XP engine with unit tests, ranks, badges, streak, precinct mastery, and a persisted profile (Section 6 rules).
- [x] T6.2 [CLAUDE] Progress screen (6A.7 W5), rank-up modal, arcade leaderboard modal, and WebAudio sounds with mute (6A.9).
- [x] T6.3 [CLAUDE] A shareable "Case Closed" card (PNG export).
- [ ] **Done when:** solving a case visibly awards XP and badges, and a rank-up can be triggered.

### T7 Forge Console (3 h), target Sun 1:00 AM
- [x] T7.0 [CLAUDE] "Open a new precinct": server endpoint `POST /api/repos` (init + mine) and a repo picker in the Forge Console header, so any GitHub repository can be forged from the UI.
- [x] T7.1 [CLAUDE] (re-tagged: coins) **Forge Console** as specified in 6A.7 W6: SSE-driven worker lanes, funnel counters, the Evidence Locker, and the discard bin with reasons. This is the key demo moment.
- [ ] **Done when:** clicking "Forge 8 cases" shows the lanes moving in real time against sarama.

### T8 Mentor (2 h), target Sun 3:00 AM
- [x] T8.1 [BOB] `deja-mentor` mode (groups: read only) and `.bob/skills/mentor/SKILL.md` (ask, point, never patch).
- [x] T8.2 [CLAUDE] In-app "Ask the Mentor" panel with step-by-step Bob IDE instructions.
- [ ] T8.3 [HUMAN] Record the mentor refusing to patch and giving a Socratic hint in Bob IDE (for the video).
- [ ] **Done when:** in Bob IDE, the mentor gives Socratic hints on a case and refuses to edit files.

### T9 Hardening + showcase deploy (4 h), target Sun 7:00 AM, **M3**
- [ ] T9.1 [BOB] **Bob Review workflow** over the whole repo (the built-in code review feature). Save its findings to `docs/reviews/BOB-REVIEW.md`.
- [ ] T9.2 [CLAUDE] **Review #3:** merge the Bob review findings with Claude's own into `docs/reviews/REVIEW-03.md` with tagged items.
- [ ] T9.3 [CLAUDE] (re-tagged: coins) Apply the review items of REVIEW-03.
- [ ] T9.4 [CLAUDE] Apply the [CLAUDE] items. Get engine and web tests green, fix Windows paths, add timeouts and worktree cleanup.
- [ ] T9.5 [CLAUDE] Showcase build (static, bundled cases, labeled replayed verification, no watsonx calls at run time) deployed to Vercel. README with a GIF, architecture, and quickstart.
- [ ] **Done when:** a fresh clone plus quickstart works, and the public URL loads.

### T10 Buffer (3 h), until Sun 10:00 AM
- [ ] T10.1 [HUMAN] Full dry-run of the demo script (Section 8). Log the problems as tagged items in `docs/reviews/REVIEW-04.md`, then route them by owner.

### S Submission (5 h), Sun 10:00 AM to 3:00 PM (the hard deadline is 8:00 PM BST)
- [ ] S.1 [HUMAN] Collect every Bob task screenshot into `bob_sessions/`. Complete `docs/BOB_USAGE_LOG.md`.
- [ ] S.2 [CLAUDE] Draft the Problem & Solution statement and the Bob Usage statement (500 words or less each) from the repo and the usage log.
- [ ] S.3 [HUMAN] Slides, cover image, and the demo video (3:00 or less, at least 90 s of the product working).
- [ ] S.4 [HUMAN] Run `check-submission.mjs` and `check-style.mjs`, verify commit authors, push, and submit on lablab **before 3:00 PM**.

---

## 8. Demo script (3:00)

| Time | Show |
|---|---|
| 0:00-0:15 | Hook: "Your new hire's first real bug happens in production. What if it happened three months earlier, safely?" Show the Anthropic debugging finding. |
| 0:15-0:40 | Forge Console: 703 fix commits funnel to certified cases, with parallel lanes and Bob writing briefs live. |
| 0:40-1:50 | Play a case: case file typewriter, take the case, open in Bob IDE, ask Deja Mentor (it refuses to patch and asks a question), apply the fix, run the tests, green. |
| 1:50-2:25 | Debrief: CASE CLOSED stamp, "You: 11 min vs original team: 3 days", diff comparison, XP, rank-up, badge. |
| 2:25-2:50 | How Bob powers it: modes, skills, subagents, parallel tasks, headless runs. Numbers from `funnel.json`. |
| 2:50-3:00 | Close: "Every repo already has its curriculum. DejaBug replays it." |

---

## 9. Division of labour: Bob, Claude Code/Codex, and the handoff protocol

### 9.1 Policy
The rules require Bob IDE to be a **core component** and the repo to contain Bob-assisted code with task-summary screenshots. Other tools are allowed. With only 40 Bobcoins, we split the work by visibility:
- **[BOB] items:** the parts judges look at and the parts that make Bob part of the product:
  - Plan-mode engine design
  - the certifier (the "proof" core) and its parallel pool
  - the forger mode and skill
  - the subagent ranking
  - the design system, the Case Board, the Investigation/Debrief loop, and the Forge Console
  - the mentor mode
  - Bob's code review
- **[CLAUDE] items** (Claude Code or Codex): scaffolding, plumbing, API clients, server, tests, secondary screens, deployment, docs, and drafting reviews.
- **Honesty:** every [CLAUDE] item is listed in `docs/BOB_USAGE_LOG.md` under "Claude Code / Codex work". The Bob Usage statement describes the split truthfully.

### 9.2 Budget: 40 Bobcoins (one registered hackathon account, no top-ups)

**Actuals so far (29.445):** T1.1 0.555, T2.1 3.33, T2.2 2.34, T2.6 3.21, T3.3 4.00, T3.4 1.19, T3.3b **14.82** (context grew to 142k tokens while Bob read the bundled `bob.js` source to reverse-engineer an output format).

**Re-plan for the remaining 10.555 coins** (2026-09-26). Keep Bob on the smallest, most judge-visible items. Re-tag the large UI items to Claude:

| Remaining Bob item | Cap |
|---|---|
| T3.6 one live `--provider bob` showcase brief (runtime Bob Shell) | 1.0 |
| T5.4 Case Board (hero screen) | 3.0 (actual 4.43) |
| T5.9 (re-tagged to Claude) | 0 |
| T8.1 `deja-mentor` mode + mentor skill | 1.0 |
| T8.3 live mentor conversation for the video | 1.0 |
| T9.1 Bob code review over the repo | 1.5 |
| Reserve | 2.0 |

Re-tagged to Claude: T5.2 design system, T5.6 Investigation + Debrief, T7.1 Forge Console, T9.3 REVIEW-03 fixes. Record this honestly in the Bob Usage statement.

**Cost guards (mandatory from now on):**
- Bob never reads `node_modules/`, bundled or minified files, or tool sources to discover behavior. If a fact is missing, Bob stops and asks the human (Claude looks it up for free).
- If a Bob task's context passes about 60k tokens or its cost passes its cap, Bob stops, summarizes, and hands off.
- The human puts every known fact (API shapes, file paths, commands) into the prompt, so Bob does not explore.

If Bob runs out anyway, the remaining [BOB] items are re-tagged [CLAUDE] with a note in the usage log.

### 9.3 Handoff protocol (Bob and Claude follow this exactly)
**On start, every agent:**
1. Reads Section 0 (Status) and Section 7.
2. Finds the first unchecked item.
3. If that item's owner is **not you**, do nothing else. Print the handoff block below and stop.

**While working:**
- Implement only the current item.
- Stop when it is done or when its "Done when" condition holds. Never start an item owned by someone else, even if it is small or obvious.
- **Bob:** one [BOB] item per Bob task. If the next item is also [BOB], say so and stop, so the human can take the task screenshot and start a fresh Bob task (fresh context saves coins).
- **Claude:** may do several consecutive [CLAUDE] items in one session. It stops at the first [BOB] or [HUMAN] item.

**On finish:**
1. Tick the finished item(s) in Section 7.
2. Update Section 0: current tier, next item ID, next owner, last updated, Bobcoins used.
3. Print the handoff block.

**Handoff block** (print it exactly in this shape):
```
HANDOFF
Done: <item IDs>
Next: <item ID> [<OWNER>] <one-line summary>
Human, do this:
  1. Review and commit: git add -A && git commit -m "<conventional message>"   (as ahammadshawki8, no trailers)
  2. <If Bob just finished> Screenshot the task summary to bob_sessions/dejabug_taskNN_<short>_summary.png and log it in docs/BOB_USAGE_LOG.md
  3. Open <Bob IDE in Plan/Agent mode | Claude Code | Codex> and paste:
     "Read PROJECT.md. Do item <ID> only, following Section 9.3."
```

**The human** relays between the agents: commit, screenshot, then paste the next prompt into the right tool.

### 9.4 Prompts to paste
- **Bob, [BOB] item:** Plan mode first: "Read @PROJECT.md. Plan item <ID> only, following Section 9.3. List the files you will touch." Then Agent mode: "Implement the plan for item <ID>. Stop when it is done and print the handoff block."
- **Bob, frontend item:** also add "Follow Section 6A strictly, including 6A.12."
- **Claude Code / Codex:** "Read PROJECT.md. Do the next [CLAUDE] items in Section 7, following Section 9.3. Stop at the first item that is not yours and print the handoff block."
- **Claude review:** "Read PROJECT.md. Do item <review ID>. Write the review file only, with items tagged [BOB] or [CLAUDE]. Do not change code."

### 9.5 Saving Bobcoins
- **Fresh task per item.** Context grows with every turn and every turn gets more expensive.
- **Point, don't paste.** @-mention `PROJECT.md` plus only the files the item touches. `.bobignore` excludes `workspace/`, `playgrounds/`, `node_modules/`, and lock files.
- **Plan mode first** (cheap), then one Agent-mode pass. Use Ask mode for questions.
- **Give Bob the acceptance test up front**, so it stops instead of polishing.
- **Claude does the prep:** before a [BOB] item, the preceding [CLAUDE] items leave clean interfaces, types, and stubs, so Bob only writes the core logic.
- **Don't let Bob run the whole sarama test suite.** Always use `-run` with specific tests.
- **Runtime Bob calls are capped:** `bob run --max-cost ${BOB_MAX_COST} --max-turns 6 --disable-mcp`. Batch brief generation uses watsonx Granite, not Bob.

### 9.6 Showing Bob 2.0 features (judged, so screenshot each one)

| Feature | Where |
|---|---|
| Plan mode | T1.1, and the plan step of every [BOB] item |
| Agent mode | Every [BOB] implementation |
| Parallel tasks | T2.2 pool. Also run a Bob task while Claude works on a [CLAUDE] item |
| Subagents | T3.4 ranking |
| Document understanding | T3.3 forger reads PR/issue threads. T5.2 reads Section 6A and the reference screenshots |
| Custom modes + skills | `deja-forger`, `deja-mentor`, `forge-case`, `mentor` (product features) |
| Bob Shell headless | T3.6 `bob run --format json` inside the engine |
| Code review | T9.1 |

### 9.7 Bob Shell quick reference
- `bob` / `bob chat`: interactive. `/status` shows usage, `/team` switches to the hackathon team, `/mode` switches mode.
- `bob run -p "..." --format json --mode <slug> -w <dir> --max-cost N --max-turns N`: headless.
- `bob --list-tasks`: list tasks. `bob -r <task-id>`: resume.

### 9.8 watsonx.ai
- **Account:** requested 2026-09-25 (activation takes up to 1 hour). $80 of IBM Cloud credits. Model inference costs $0.0001 per 1,000 tokens.
- **Use:** batch generation of case briefs and hints with an IBM Granite instruct model, through the watsonx.ai API (`llm/watsonx.ts`).
- **Banned models** (the guide says they hurt judging): `llama-3-405b-instruct`, `mistral-medium-2505`, `mistral-small-3-1-24b-instruct-2503`.
- **Credentials:** only in `.env`. A key exposed in a public repo gets deactivated and the account suspended.
- **The account closes Sep 27 at 10 AM ET (8 PM BST).** The showcase deploy must never call watsonx at run time. Cases are pre-generated and committed.

---

## 10. Data and compliance
- **Source:** IBM/sarama git history, code, and public PR/issue text (MIT license, public GitHub). Listed in `docs/DATA_SOURCES.md`.
- **No personal information:** usernames, emails, and avatars are stripped at fetch time. Only counts and durations are stored.
- **Bundled data:** case JSON contains redacted Bob-written summaries, not verbatim discussion threads.

---

## 11. Session resume protocol
1. Read Section 0 (Status) and the latest Progress Log entry.
2. Run `git log --oneline -10` and `git status`.
3. Continue from the first unchecked item in Section 7, but only if you are its owner. Otherwise print the handoff block (Section 9.3).
4. At the end of the session: tick boxes, update Status, and append to the Progress Log.

## 12. Progress log
- **2026-09-25 23:00:** Idea locked (DejaBug). Demo repo chosen: IBM/sarama, with 174 candidate fixes measured. Workspace, Bob config, submission templates, and the check scripts are in place. Bob Shell 2.0.5 is installed. Bob IDE is being installed.
- **2026-09-26 00:10:** T0 done (Claude): npm workspaces (engine + web), TypeScript 5.9, vitest 5, eslint 10, prettier, Vite 8 + React 18, CI workflow, and .env.example. The engine has types.ts (the case contract), config.ts, and `dejabug doctor` / `serve` (health endpoint). Gate green locally. Next: T1.1 [BOB].
- **2026-09-26 00:15:** T1 done. T1.1 (Bob, Plan mode, 0.555 coins) produced docs/ENGINE_PLAN.md. T1.2-T1.3 (Claude): miner.ts, git.ts, the `dejabug mine` CLI, and fixture-repo tests (17 tests green). sarama: 2,889 commits, 703 fix-like, 101 runnable candidates in cases/sarama/candidates.json. Next: T2.1 [BOB] certifier core.
- **2026-09-26 00:45:** T2.1 done by Bob (3.33 coins, Plan then Agent). Claude review (docs/reviews/REVIEW-T2.1.md) found 3 correctness defects, all verified with go test: build failures read as test failures, unanchored -run, and no-tests-to-run read as a pass. It also found robustness issues and lint errors. They are bundled into Bob's T2.2 task. T2.1 is committed locally and not pushed until lint passes.
- **2026-09-26 01:20:** T2.2 done by Bob (2.34 coins): p-limit pool plus all 7 REVIEW-T2.1 fixes. T2.3 done by Claude: store.ts (atomic JSON, merge, funnel), `dejabug certify` (--limit/--concurrency/--only/--redo), and certifier tests on a real Go fixture covering all statuses (21 tests). Go added to CI. Smoke run on sarama: 2 of 4 certified in 25 s with 4 workers. Notes for REVIEW-01: (a) worker slot is i % concurrency, not a true slot, (b) fail output contains the local temp path, which includes the Windows username, (c) rejected:build stores no output.
- **2026-09-26 01:50:** T2.4 batch: the first run was invalid (no Go on PATH in that terminal, so 40 were misread as build failures). The CLI now has a Go preflight. The rerun gives **23 certified of 44 attempted** (9 build, 5 no-fail, 2 no-pass, 5 timeout; the timeouts are hang bugs). Temp paths were scrubbed from the data. T2.5 REVIEW-01 is written (5 [BOB] items, 4 [CLAUDE] items). Next: T2.6 [BOB].
- **2026-09-26 02:00:** Product decision (user): DejaBug must work on any well-maintained repository, not just sarama. Added Rule 10, F0 Onboard, the language adapter architecture, and new items T2.5a (adapter refactor, Claude, before Bob's T2.6), T4.4 (Python adapter), T4.5 (second-repo proof), and T7.0 (repo picker). REVIEW-01 items 1 and 4 move into the Go adapter.
- **2026-09-26 02:45:** T2.5a done (Claude). The engine is repository-agnostic: `adapters/` (the LanguageAdapter interface, errors, registry, and a Go adapter with anchored -run, hang/notest/build classification, ToolMissingError, and multi-module routing by nearest go.mod). The miner runs on the adapter. `Candidate.language`, `dejabug init <owner/repo>`, a global `--target`, and an adapter-driven doctor and preflight were added. 35 tests. Second repo proven at the mining level: IBM/fp-go gives 137 candidates. Its recent fix: commits are mostly API additions (genuine build rejections). REVIEW-01 item 10 added (the pass phase restores the full fix tree). Next: T2.6 [BOB].
- **2026-09-26 03:40:** M1 reached. T2.6 (Bob, 3.21 coins): the certifier runs on adapters, and 4 of 5 hang bugs are now certified. **sarama: 27 certified of 44 attempted.** T2.7 (Claude): store sanitizes on merge (stripLocalPaths), DEJABUG_TEST_TIMEOUT_SEC added, tests for deadlock certification, ToolMissingError abort, output sanitizing, and build-output recording (42 engine tests). Queued for REVIEW-02 [BOB]: for hang results, keep the head of the output (the "panic: test timed out ... running tests: TestX" headline) instead of the tail of the goroutine dump.
- **2026-09-26 04:10:** T3.1 (github.ts: PR resolution by commit, linked issues, ETag disk cache, gh auth token fallback, redaction of mentions/emails/attachments, original effort as counts only), T3.2 (llm/watsonx.ts: IAM token cache, chat API, banned-model guard, `dejabug models`, extractJson), and T3.5 (spoiler.ts, language-agnostic) done by Claude. 58 tests. Added T3.4b (brief CLI and case assembly). Next: T3.3 [BOB] forger.
- **2026-09-26 04:30:** watsonx is live. The account lists granite-4-h-small, granite-guardian-3-8b, llama-3-3-70b, llama-4-maverick, mistral-large-2512, and gpt-oss-120b (banned models are filtered). WATSONX_MODEL_ID is ibm/granite-4-h-small, and a test chat returned valid JSON in 3.7 s. The secrets had been typed into .env.example; they were moved to .env before any commit, and check-style now fails if .env.example holds a secret value.
- **2026-09-26 04:55:** T3.3 done by Bob (4.00 coins): the deja-forger mode, the forge-case skill, and briefer.ts (watsonx and bob providers, zod, spoiler retry) with tests. Claude hygiene fix to Bob's test (vitest 5 generics, type-import lint, prettier) to keep CI green without spending coins. The Claude spoiler guard was refined: comments and plain English words are no longer spoilers, only code-shaped identifiers and literals. First real Granite brief for fc42022 succeeded in 3.9 s (PR #3579, 1.7 days open, 3 review rounds). Review notes are queued in docs/reviews/REVIEW-02-queue.md.
- **2026-09-26 05:10:** T3.4 done by Bob (1.19 coins): 4 explore subagents in parallel ranked all 27 certified cases into cases/sarama/ranking.json (teaching value, difficulty, precinct from a fixed list, reason). Screenshots of the parallel subagents are saved. Reasons are internal only, because some hint at the fix.
- **2026-09-26 05:40:** T3.4b done (Claude): assemble.ts (bugAgeDays via git blame of the lines the fix touched, par time 10/20/30 min, ranking overrides for precinct/difficulty, sanitized outputs) and `dejabug brief` (parallel, --only/--limit/--redo/--provider). A real run on 3 cases with Granite: 2 good, 1 with hints copied from the SKILL.md examples (file deleted). Wrote REVIEW-T3.3 and added T3.3b [BOB] before T3.6. 66 tests.
- **2026-09-26 06:30:** T3.3b done by Bob (14.82 coins, far over budget: 142k context from reading the bob.js bundle). Result is good: skill examples removed, codename rules added, JSON retry, client reuse, the bob provider parses the `last_message` envelope, and it uses shell on Windows with the prompt on stdin (unverified until T3.6). Coin re-plan: T5.2, T5.6, T7.1, and T9.3 re-tagged to Claude, and cost guards added (Section 9.2 and .bob/rules).
- **2026-09-26 07:00:** Granite briefs generated for all 27 certified sarama cases in 47 s (the spoiler guard fixed 3 leaks by retry). The model reused the skill's example codename 10 times, so Claude added codenames.ts plus `dejabug codenames` (a unique-name pass with Granite, also run after every brief batch). All 27 are unique. scripts/check-cases.mjs (paths, emails, mentions, duplicate codenames) was added to CI. Highlight for the demo: 66e60c7 "Infinite Coordinator Loop" was cold for 1,513 days.
- **2026-09-26 07:30:** T3.6 complete. With BOB_API_KEY (Inference scope) in .env, `brief --provider bob` ran Bob Shell headless with the deja-forger mode and forge-case skill, and wrote fc42022 "The Overflowing Slice" in 18.7 s (prompt on stdin verified). Its quality beats Granite (a richer hint ladder). Added `Case.briefedBy` (bob-shell or watsonx:<model>) and backfilled the 27 cases, so the UI can show which IBM engine wrote each brief.
- **2026-09-26 08:30:** T4.1-T4.3 done (Claude). play.ts exports the parent commit via a worktree with autocrlf off, overlays the fix tests, and makes a fresh single-commit repo with AGENTS.md and the deja-mentor mode. verify.ts runs the adapter with a 20 s per-test timeout. forge.ts holds the pipeline shared by the CLI and the server. server.ts (Fastify) serves health, repos, cases (public view hides fixDiff, lesson, and hints), session, start, ordered hints, verify, giveup, reveal (403 until solved or given up), funnel, profile, and forge plus SSE events (one run at a time). Sessions persist in .dejabug/state.json. Case.testFiles was added and backfilled.
- **2026-09-26 03:40 (real clock):** Note: progress-log times after 02:45 were estimates that ran ahead of the real clock; the real time is now Sat 03:40. T4.4 done: Python adapter (pytest: test file and name detection incl. classes, exit-code classification, hang = killed at timeout, the checked-out code comes first on PYTHONPATH, per-repo virtualenv at workspace/.venvs/<repo> activated automatically). T4.5 proven on **IBM/python-sdk-core**: 489 commits, 98 fix-like, 45 candidates in 3.2 s, **31 certified in 44 s**, and 28 briefed with Granite. Total: **55 cases across 2 languages and 2 IBM repos**. The privacy sanitizer now redacts home directories in any separator form plus truncated worktree names. check-cases scans every JSON file for local paths, and prose only for emails and @mentions (Python decorators in diffs are fine). 87 tests. Follow-up idea: `dejabug init` could create the Python virtualenv automatically.
- **2026-09-26 03:35:** T5.1-T5.3 done (Claude). Web: Vite 8 + React 18 + Tailwind 4 (@theme tokens from 6A.3) + Framer Motion + Zustand + React Router 7, self-hosted fonts, pixelarticons. Typed API client (types shared from the engine via the @engine alias), game, profile, and settings stores. Design system: pixel art from character grids (5 rank insignias, 7 badges, pin, clip, magnifier pips), and the full 6A.10 component inventory (ArcadeButton, Panels, StatTile, RibbonTitle, Stamp, TypewriterText, Terminal, XpBar, CountUp, MasteryRing, BadgeCard, StreakCalendar, CaseFolder with 4 states, HintLadder, Timer, VersusPanel, Modal, Toast, Tooltip, DossierTabs, FunnelCounter, WorkerLane), shown at /styleguide. The game shell has the rail, a top bar with rank/XP/streak/mute/engine light, and a dispatch ticker. XP rules are in lib/rules.ts with tests. Visual review via Playwright screenshots, with 5 fixes applied. Engine dev script switched to node --watch (tsx watch hung under concurrently on Windows).
- **2026-09-26 04:10:** T5.4 done by Bob (4.43 coins): Case Board with stat tiles, precinct tabs, cork grid, the four folder states, red string on hover, and loading/error/empty states. Claude fixes: precinct tabs are derived from the data instead of hardcoded sarama areas (Rule 10; consumer-group had no tab), and a stray footer was removed. T5.5 done (Claude): Case File dossier (two pages sliding in, typewriter symptoms, wrapped evidence terminal, mission parameters incl. "Briefed by IBM Bob/Granite", Take the case, playground path with copy, Bob IDE + Deja Mentor steps). **Only 4.5 Bobcoins left** (35.5 used, per the user): Bob does only T8.1 mentor mode, T8.3 live mentor demo, and T9.1 code review. T5.9 is re-tagged to Claude. Note: dev servers were stopped by Claude Code for low system memory; visual checks resume when they are restarted.
- **2026-09-26 04:40:** T5.6-T5.10 done (Claude): Investigation (live timer, objective, draining XP meter, 3-envelope hint ladder with confirmation, big RUN TESTS with R shortcut, verdict terminal for pass/fail/hang/build/notest, give-up with confirmation), Debrief (CASE CLOSED slam, XP count-up with breakdown, rank bar, promotion modal and confetti only on first solve or rank-up, VS panel, your diff vs the original fix via diff2html, lesson card, next case), Settings (repository switcher across IBM repos, sound, volume, reduced motion, profile reset), lazy routes, and REVIEW-02 (7 items, all applied). Solve logic in lib/solve.ts with tests. The M2 visual check of the full loop is still pending until dev servers can run again (memory).
- **2026-09-26 05:05:** T6 done (Claude): badge rules (lib/badges.ts, 7 badges, tests) awarded on solve and shown flipping in on the debrief; WebAudio sounds (click, hint, stamp, fail, pass, rank-up; mute and volume respected); the Progress screen (rank ladder, XP bar, badge collection with locked silhouettes, precinct mastery rings, 35-day streak calendar, closed files table, Hall of fame modal with the speed factor vs the original team); and a Case Closed share card (canvas PNG, no personal data). 96 tests. Browser verification is still pending (memory).
- **2026-09-26 05:30:** T7.0-T7.1 done (Claude): Forge Console with a repository picker plus "open a new precinct" for any GitHub owner/name (the engine clones, mines, certifies and briefs), candidate and worker controls, funnel counters, live SSE worker lanes (chip moves Mine, Certify, Brief with fail/pass lights and a writing indicator), Evidence Locker (new cases drop in with a stamp sound), discard bin with plain-English reasons, and a log terminal. Stage events carry the commit subject via a relay in forge.ts. The reducer is in lib/forgeView.ts with tests. The live forge run in the browser is pending (memory).
- **2026-09-26 06:15:** T8.1 done by Bob (0.732 coins): the deja-mentor custom mode (groups: read only, so it cannot edit files) and the mentor skill (5-step Socratic method). T8.2 done (Claude): Ask the Deja Mentor panel on the Investigation screen (copy playground path, switch mode, copy a ready opening message), plus `dejabug start <id> [--reset]` to export a playground from the CLI. Playgrounds get the mentor mode and skill in .bob/. Clean demo playgrounds are ready at playgrounds/fc42022 and playgrounds/66e60c7.
