# Sessions, slice 4: Finish, detail, History, editing and backfill

Status: ready after slice 2. Decisions: [ADR 0038](../../adr/0038-sessions.md) (Finish; History, detail and editing).

## Goal

Finishing records a correct Session and, only when asked, updates its Workout. Every finished Session can be browsed, edited, deleted with Undo, shared as text, or saved as a Workout. Past workouts can be logged.

## Work

- **Finish flow**, replacing slice 2's placeholder:
  1. Summary: duration, volume, sets and Records; editable title, note, start date/time and duration; "n sets not done won't be saved".
  2. Update Workout?: `diffSessionAgainstWorkout(session, workout)` (pure and tested) returns structure and target changes. The step shows only when either is non-empty. It has two toggles, both off, each with a readable diff. When the source is missing it offers "Save as new Workout". Applying uses the existing training store operations in one transaction.
  3. Celebration: Record cards with the success haptic, Share as text and Done.
- **Session detail** (`/history/[id]`):
  - header: title, date and time, source link when the source exists
  - stats row
  - muscle distribution: map and top 3 bars with Show all (map component from slice 5; until then, bars only)
  - each exercise with "60 kg × 8" rows, W/D/T badges, Record badges, effort and notes

  Menu: Edit, Save as Workout, Share as text, Delete with Undo.

- **Editing**: Edit opens the logging screen for the finished Session with no timers. Sets are edited directly, ticks are implied, and the date and duration can change.
- **History** (`/history`, an entry in the ⇕ switcher menu): rows grouped by ISO week in the user's timezone. Each week header shows sessions, sets and volume; each row shows the title, date, duration and its top 3 exercises. The header has "Log past workout". Empty state: "Your finished workouts appear here".
- **Log past workout**: choose a Workout or start empty, then a date and time; opens the editing screen; saved with `finished_at` derived from the duration.
- **Share as text**: a session counterpart of `plan-as-text`.

## Tests

- Unit: `diffSessionAgainstWorkout` (added, removed, replaced, reordered, set count, target weight), week grouping across timezones and DST, share text.
- Seam 1: backfill window refused outside the bounds.
- Manual: finish with the plan update on, off and half on; delete the source Workout mid-session and use Save as new; edit an old Session and see its Records move; Undo a delete.

## Done

The standard checks pass and the manual checks are recorded.
