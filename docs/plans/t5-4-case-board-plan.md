# Plan: T5.4 Case Board Page

## Overview

Replace the placeholder `apps/web/src/pages/CaseBoardPage.tsx` with the full Case Board (6A.7 W1).
Only one file is written. All state, components, and utilities are pulled from existing pieces.

**Done when:** The Case Board renders in the browser with stat tiles, precinct tabs, a cork-surface
folder grid, themed loading/empty/error states, and the red-string hover SVG linking same-precinct
folders. Difficulty-3 cases lock until 300 XP, solved cases show best time, active case is
highlighted, and clicking a folder navigates to `/case/:id`.

---

## Files Touched

| File | Change |
|---|---|
| `apps/web/src/pages/CaseBoardPage.tsx` | Replace placeholder with full implementation |

No other file is created or modified.

---

## Sub-Task 1: Data wiring

**Intent**
Pull the three slices of state the page needs and derive the values used in the render.

**Relevant context**
- `useGame` (zustand, `apps/web/src/state/game.ts`): `{ cases: PublicCase[], status, error }` - already loaded by `AppLayout`.
- `useProfile` (`apps/web/src/state/profile.ts`): `profile.solves` is `SolveRecord[]` with `{ caseId, seconds }`.
- `useSettings` (`apps/web/src/state/settings.ts`): `activeCaseId?: string`.
- `rankFor(xp)` in `apps/web/src/lib/rules.ts`: returns `{ rank, next, progress }`.
- `formatDuration(seconds)` in `apps/web/src/lib/format.ts`: e.g. `90 -> "1:30"`.

**Derivations to compute at the top of the component:**
- `solveMap`: `Map<caseId, SolveRecord>` built from `profile.solves` for O(1) lookups.
- `openCount`: cases not in `solveMap`.
- `closedCount`: cases in `solveMap`.
- `bestSeconds`: min `seconds` across all `SolveRecord` entries (undefined if none).
- `{ rank }` from `rankFor(profile.xp)`.
- `folderState(c)`: returns `FolderState` - "solved" if in solveMap, "active" if `c.id === activeCaseId`, "locked" if `c.brief.difficulty === 3 && profile.xp < 300`, else "available".
- `footnoteFor(c)`: returns `"Best " + formatDuration(solve.seconds)` if solved, else undefined.
- `lockedReasonFor(c)`: returns `"Reach Detective"` if locked, else undefined.

**Expected outcomes**
All values are derived without any new API call. Works even when `profile.solves` is empty (the zero state).

**Status:** [ ] pending

---

## Sub-Task 2: Stat tiles row

**Intent**
Render the four `StatTile` components above the board as specified in 6A.7.

**Relevant context**
- `StatTile` from `apps/web/src/components/game/Panels.tsx`: props `{ label, value, tone, icon }`.
- Tones: navy, amber, stamp, manila.
- Tiles: Open cases (navy), Closed (stamp), Best time (amber, `formatDuration` or "--" if none), Current rank (manila, `rank.name`).
- Icons from `pixelarticons/react/`: e.g. `Folder`, `Check`, `Clock`, `Star`.

**Layout**
```
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
  <StatTile .../>  x4
</div>
```

**Expected outcomes**
Four tiles visible in a row (2-col on mobile, 4-col on sm+). Values update reactively when solves change.

**Status:** [ ] pending

---

## Sub-Task 3: Precinct DossierTabs with counts

**Intent**
Render precinct filter tabs above the folder grid. Clicking a tab filters visible cases.

**Relevant context**
- `DossierTabs` from `apps/web/src/components/game/Forge.tsx`: generic `<T extends string>`, props `{ tabs, active, onChange, label }`. Each tab has `{ id: T, label: ReactNode, count?: number }`.
- Precincts from 6A.7: All, Producer, Consumer, Protocol, Client, Admin.
- `c.brief.precinct` is the string to filter on (lowercase from the engine).
- Tab `count` = number of `cases` matching that precinct (for "All" = `cases.length`).
- Local state: `const [precinct, setPrecinct] = useState<PrecinctId>("all")`.
- `PrecinctId = "all" | "producer" | "consumer" | "protocol" | "client" | "admin"`.
- `filteredCases = precinct === "all" ? cases : cases.filter(c => c.brief.precinct.toLowerCase() === precinct)`.

**Expected outcomes**
Tabs show live counts. Switching tabs filters the grid below. "All" is the default.

**Status:** [ ] pending

---

## Sub-Task 4: Cork-surface folder grid

**Intent**
Render the filtered cases as `CaseFolder` components on a cork-textured grid. Clicking opens the case.

**Relevant context**
- `CaseFolder` from `apps/web/src/components/game/CaseFolder.tsx`: props `{ c, state, lockedReason, footnote, onOpen }`.
- `tiltFor(id)` is used internally by `CaseFolder` - no need to pass it externally.
- Cork surface: `className="bg-[oklch(...)]"` - use `bg-cork` design token if it exists, or the existing pattern. The StyleguidePage may show the correct class. Fall back to a warm brown CSS pattern.
- Grid: `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6`.
- `onOpen` navigates with `useNavigate()` to `/case/${c.id}`.
- The `<section>` wrapping the grid must have `id="cork-board"`.

**Cork texture implementation**
Check if a `bg-cork` utility exists in `tailwind.config.ts`. If not, use the closest warm background token (`bg-manila` or similar). The cork CSS background pattern (radial dots) can be applied via a className if the token exists.

**Expected outcomes**
Folders appear on a warm/cork background, each with the correct state, footnote, and tilt. Clicking an unlocked folder navigates to its case file.

**Status:** [ ] pending

---

## Sub-Task 5: Red-string SVG hover effect

**Intent**
On hover over a folder, draw SVG lines connecting it to all other visible folders in the same precinct.

**Relevant context**
- 6A.7: "On hover, a red string links cases in the same precinct."
- Approach: the cork board section is `position: relative`. An absolutely-positioned `<svg>` overlay covers the full board (same dimensions). The SVG is only visible when a folder is hovered.
- Each folder `<CaseFolder>` is wrapped in a `<div ref>` to get its `getBoundingClientRect()`.
- On mouse-enter a folder (`hoveredId` state), find all other folders in the same precinct and draw `<line>` elements between their center points.
- Use `useRef` on each folder wrapper div to store positions, or use `getBoundingClientRect()` relative to the board container.

**Implementation approach**
```
const boardRef = useRef<HTMLDivElement>(null)
const folderRefs = useRef<Map<string, HTMLDivElement>>(new Map())
const [hoveredId, setHoveredId] = useState<string | null>(null)

// Compute string endpoints
const strings = useMemo(() => {
  if (!hoveredId || !boardRef.current) return []
  const hovered = folderRefs.current.get(hoveredId)
  if (!hovered) return []
  const boardRect = boardRef.current.getBoundingClientRect()
  const hoveredRect = hovered.getBoundingClientRect()
  const hoveredPrecinct = cases.find(c => c.id === hoveredId)?.brief.precinct
  // ... collect other folders in same precinct, compute center-to-center lines
}, [hoveredId, cases])
```
SVG lines use `stroke="var(--color-stamp)"` (stamp red), `strokeWidth="2"`, `opacity="0.7"`.
Under `useReducedMotion`, skip the SVG entirely.

**Expected outcomes**
Hovering a folder draws 1-3 red string lines to same-precinct siblings. Lines disappear on mouse-leave. No SVG shown under reduced motion.

**Status:** [ ] pending

---

## Sub-Task 6: Themed loading, empty, and error states

**Intent**
Show the three non-ready states as specified in 6A.7: loading, empty board, and engine offline/error.

**Relevant context**
- `status` from `useGame`: "idle" | "loading" | "ready" | "error".
- `error` from `useGame`: string.
- 6A.7 states:
  - **Loading:** paper sliding in (a pulsing manila placeholder block, `motion` animated).
  - **Empty board:** "No open cases. Fire up the Forge." with a link/button to `/forge`.
  - **Error / engine offline:** "Radio silence from HQ" with a retry button (calls `loadCases(repo, true)`).
- Patterns from `CaseFilePage.tsx`:
  - Loading: `motion.div` with `bg-manila/60`, pulsing opacity.
  - Error: `PaperPanel` with a `Stamp` and text.
- `ArcadeButton` for the retry/forge actions.

**Expected outcomes**
- While `status === "loading"` or "idle": the pulsing manila placeholder covers the grid area.
- When `status === "ready"` and `filteredCases.length === 0`: empty message shown.
- When `status === "error"`: stamped error memo shown.
- When `status === "ready"` and cases exist: the cork board renders.

**Status:** [ ] pending

---

## Sub-Task 7: Page title and overall structure

**Intent**
Wire up `usePageTitle`, compose the full page layout, and ensure keyboard accessibility.

**Relevant context**
- `usePageTitle("Case Board", <Folder />)` from `apps/web/src/pages/pageTitle.tsx`.
- `Folder` icon from `pixelarticons/react/Folder.js` (already imported in the placeholder).
- Page wrapper: `<div className="py-4 max-w-7xl">`.
- Section order: stat tiles row, then `DossierTabs` + cork board section.
- The `<section>` wrapping the cork board should have `aria-label="Case board"`.
- The cork board tabs + grid should be wrapped in a `<div>` where the tabs are visually connected to the grid below (border on the grid, tabs hang above it - standard dossier pattern from `DossierTabs`).

**Expected outcomes**
Page title in the TopBar reads "Case Board" with the Folder icon. Layout matches the spec. ARIA labels on key regions.

**Status:** [ ] pending

---

## Implementation Notes

- All state is read-only here; no writes except `navigate()`.
- `useGame`, `useProfile`, `useSettings` are subscribed with selectors to avoid spurious re-renders.
- The red-string SVG is computed on each render when `hoveredId` changes; no need for `useEffect` for this.
- Do not add any new components or files. Everything is assembled from the imports listed above.
- `bg-cork` token: check `tailwind.config.ts` before using it. If missing, use `bg-manila` as the board surface.
- The `DossierTabs` + content area follow the established pattern from `ForgePage` (the tabs hang above a bordered content block; the tab for the active precinct visually merges with the grid surface).

---

## Status: [ ] pending
