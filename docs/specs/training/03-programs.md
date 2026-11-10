# Training plans, slice 3: Programs and the Rotation editor

Status: blocked on slice 2. Decisions: [ADR 0036](../../adr/0036-training-plans.md).

## Goal

A user builds a Program such as a 6-day push/pull/legs or upper/lower split: its Workouts, a Rotation with repeats and Rest Slots, a Markdown description and a planned length. Workouts move in and out of Programs by copying.

## Work

### Programs on the Train tab

- The Programs section lists Programs: generated tile (initial on a tint; the cover photo arrives in slice 4), title, `4 days · 6-day rotation · 12 weeks`. Days per week is derived by `rotationSummary(slots)`, which is pure and tested.
- The tab action menu gains "New program".

### Creating a Program

- New program asks for a title only, then opens the Program screen with an empty Rotation.
- Rotation actions: "Add workout" (sheet: New workout, or copy one of your standalone Workouts or one of this Program's), "Add rest day", and "Repeat a workout" (picks one of this Program's Workouts for another Slot).

### Program screen (`train/program/[id].tsx`)

- Header: title, the description rendered as Markdown (collapsed after 4 lines, "More"), and planned weeks.
- Rotation list: each Slot shows its position number, the Workout tile, title and exercise count, or a quiet "Rest" row. Tapping a Workout Slot opens the slice 2 editor for that Workout. A Workout that fills several Slots shows a small "×2" on each.
- Long-press drag reorders Slots (`moveSlot`). Row ⋯: Edit workout, Duplicate as new workout (a new Workout placed in this Slot), Remove from rotation (the Workout is deleted only when no Slot uses it any more, and the toast says so), Save as standalone.
- Program ⋯: Edit details, Duplicate program (`copyProgram`), Share as text (slice 4), Delete (Undo toast; cascades as in slice 1).

### Program details sheet

- Title, the planned length (Off or 1–52 weeks, as a stepper), and the description.
- The description editor uses `react-native-enriched-markdown`. Check that the library supports Expo 58 and the New Architecture before adding it. Store Markdown text. If the library does not fit, fall back to a plain multi-line field whose text is rendered as Markdown, and record that choice in ADR 0036.

### Standalone ↔ Program

A standalone Workout's ⋯ gains "Add to program…" (pick a Program; the Workout is copied and appended as a new Slot). A Program Workout's ⋯ has "Save as standalone" (copied). Both show a toast with "Open".

## Tests

- Unit: `rotationSummary` (Rest Slots, repeats, an empty Rotation), and the rule that removing a Slot deletes the Workout only when no other Slot uses it.
- Seam 1: copying a Workout into a Program duplicates the Workout and its exercises with new ids and leaves the original unchanged.
- Native: screenshots in light and dark of a 6-Slot push/pull/legs Program, an upper/lower Program with Rest Slots and repeats, and the details sheet.

## Done

All repo checks pass; screenshots attached.
