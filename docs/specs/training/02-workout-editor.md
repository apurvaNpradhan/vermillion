# Training plans, slice 2: Train tab and Workout editor

Status: blocked on slice 1. Decisions: [ADR 0036](../../adr/0036-training-plans.md). Read [data-flow](../../../.agents/data-flow.md), [ui](../../../.agents/ui.md), [i18n](../../../.agents/i18n.md) and [ADR 0030](../../adr/0030-native-component-sourcing.md) first.

## Goal

A user builds a standalone Workout from nothing in a few taps, adjusts it without seeing a single empty set grid, and reorders, replaces, duplicates or deletes, all offline.

## Work

### Train tab (`apps/native/app/(app)/train/`, `apps/native/src/training/`)

- A tab after Home, so it is the second direct tab in the pill. Tab action: "New workout".
- `ScrollPage` with sections: Programs (filled in slice 3; empty here) and Workouts (standalone, newest first). Each Workout row shows a generated tile (the primary muscle's body-map group icon on a tint), the title (or derived name) and `6 exercises · ~55 min`. The duration estimate is sets × (40 s + rest), as a pure tested function.
- States: first sync, empty ("Build your first workout" with the New workout button), list, query error. None of them looks like another.
- Module hooks: `use-workouts`, `use-workout(id)`, `use-workout-actions`.

### Creation

- New workout creates the row, then opens pick mode (`max` unset). On return, `addExercises` runs in pick order and the editor opens. If pick mode is cancelled with nothing picked and the Workout is untouched, the row is deleted silently.
- The title field shows the derived name as a placeholder. Typing sets `title`; clearing it returns to the derived name.

### Editor (`train/workout/[id].tsx`)

- Header: title (inline editable), note (plain text, multi-line, links detected), the ⋯ menu (Duplicate, Share as text in slice 4, Delete).
- Exercise rows: thumbnail, name, summary line from `summariseSets(sets, type, prefs)`. Examples: `3 × 8–10 · RPE 8–9 · 2:00`, `2 warm-up + 3 × 6–8 @ 100 kg`, `3 × 30 s`, `Rest off`. Under it, the pinned note in muted text if there is one. `summariseSets` is pure and tested; it respects the RPE/RIR and kg/lb preferences.
- Row ⋯: Replace, Superset with next (slice 4), Remove (Undo toast).
- Long-press drag reorders with `moveWorkoutExercise`. While dragging, rows collapse to one line. A haptic tick fires on each crossing. Reduce Motion is honoured.
- An "Add exercises" button at the end opens pick mode with `exclude` set to the exercises already in the Workout.
- Every edit writes through the store on change (text debounced 400 ms). No Save or Cancel.

### Exercise sheet

- Opened by tapping a row. It shows the exercise name (linking to its detail screen), the pinned note field, rest and the targets.
- Rest: a stepper in 15 s steps from 0:15 to 10:00, plus an Off toggle.
- "All sets alike" (on by default whenever all working sets are equal):
  - one target row with the type's fields (rep range as two steppers joined by "to", weight, Effort selector),
  - a working-set count stepper (1–20),
  - a warm-up count stepper (0–5; warm-ups have reps only).
- Turning it off lists sets one by one. Each set has a kind chip (W, 1…n, D, F) that opens a four-option sheet, its own targets, swipe to remove, and an Add set button. Turning it back on is offered only when the sets are equal again.
- Effort selector: a segmented 9-step control labelled in the preferred scale, single value or range (drag across). Port PanelUI's segmented control or reuse `segmented-control.tsx` if it fits.
- Weight entry uses `parseWeight` and the preference unit.

### Replace

Single pick (`max: 1`) with "Swap for" suggestions pinned above the list. `replaceExercise` keeps sets, rest and note when the type matches. Otherwise it resets the sets to the type's defaults and keeps the note, and a toast says "Targets reset for ‹type›".

### Delete and Duplicate

Delete soft-deletes and shows an Undo toast for 5 s. Duplicate copies with the title "‹title› (copy)", or a null title if it was derived, and opens the copy.

### From the exercise detail

"Add to workout" opens a sheet listing standalone Workouts plus "New workout with this exercise". Picking a Workout appends the exercise.

## Tests

- Unit: `summariseSets` across types and preferences, the duration estimate, all-sets-alike detection, default-rest rules.
- Native: adb screenshots in light and dark of the empty Train tab, the editor with 7 exercises, the exercise sheet in both modes, and a drag in progress. A 7-exercise Workout built from an empty state in under 30 s on a mid-range Android.

## Done

All repo checks pass; screenshots attached.
