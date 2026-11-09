# Exercise library, slice 2: library screen

Status: blocked on slice 1. Decisions: [ADR 0034](../../adr/0034-exercise-library.md). Read [data-flow](../../../.agents/data-flow.md), [ui](../../../.agents/ui.md), [i18n](../../../.agents/i18n.md), [ADR 0028](../../adr/0028-native-navigation-shell.md) and DESIGN.md first.

## Goal

A user opens Exercises from the switcher menu and finds any exercise by scrolling, searching or filtering, offline.

## Work

### Route and shell

- `apps/native/app/(app)/exercises/index.tsx` as a tab route declared after the direct tabs, so it lands in the switcher menu. Phosphor `Barbell` icon.
- `useTabAction` registers "New exercise" (routes to the form from slice 4; until then hidden).
- `ScrollPage`-style header with a search field that stays in the compact bar.

### Library component (`apps/native/src/exercise/library/`)

- `ExerciseLibrary` with `mode: "browse" | "pick"`. Browse is built here; pick mode's selection bar is slice 5, but the prop and the row's selected state exist now.
- Module hook `useExerciseLibrary({ search, muscles, includeSecondary, equipment, show, sort })` returns rows, total, and a status (`first-sync | offline-unsynced | ready | error`). Components never query directly.
- Query builder in `packages/sync/src/exercise/library-query.ts` (pure, unit-tested): tokens AND-ed over `title`, `aka`, `search_terms`; muscle filter on `primary_muscle IN (…)` or, with secondary, also `EXISTS (SELECT 1 FROM json_each(secondary_muscles) WHERE value IN (…))`; equipment `IN (…)`; show = all (live only) / custom (`user_id IS NOT NULL`, live) / archived (`retired_at IS NOT NULL`, custom only). Order: search → starts-with, rank desc, title, id; A–Z → title, id; Popular → rank desc, title, id. Bounded window, virtualised list.
- First-sync status from the PowerSync priority-3 sync status; offline-unsynced when also disconnected.

### Rows

- Square thumbnail (expo-image, disk cache, muscle-group icon fallback on missing key or error), title, `primary muscle · equipment` in muted text, Custom badge. Chevron in browse mode.
- Recent section: hidden until training exists (the hook returns an empty list now).

### Filters

- Two pills under search ("Any muscle", "Any equipment"; show "Chest +1" when set) and removable chips for active filters.
- One HeroUI bottom sheet: Muscle section (List view now: Upper / Lower / Other grid with group icons; the Body view toggle arrives with slice 3), "Include secondary muscles" switch, Equipment 9-cell icon grid, Show segmented control (All / Custom / Archived). Live "Show N results" and Clear. A pill opens the sheet scrolled to its section.
- Sort toggle (A–Z / Popular) remembered in device storage.

### States

- First sync: skeleton rows plus "Downloading the exercise library"; Custom exercises render above.
- Offline before first sync: message plus create button.
- No results: "No matches", Clear filters, and "Create ‹query›" (opens the form prefilled once slice 4 lands).
- Archived empty: plain note.
- Query error: message and Retry, never the empty state.

## Tests

- Unit: the query builder (each facet, combinations, escaping, every order), sort persistence helper.
- Native: typecheck, a dev build on Android via adb, screenshots light and dark of: list, search results, filter sheet, each state. Airplane-mode check after first sync.

## Done

All repo checks pass; screenshots attached to the PR.
