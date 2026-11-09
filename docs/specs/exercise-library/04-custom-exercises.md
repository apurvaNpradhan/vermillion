# Exercise library, slice 4: custom exercise form and archive

Status: blocked on slice 2 (can run alongside slice 3). Decisions: [ADR 0034](../../adr/0034-exercise-library.md), [ADR 0019](../../adr/0019-synced-table-conventions.md) (dirty fields, rejected writes).

## Goal

A user creates an exercise the catalog lacks, edits it, archives and restores it, offline.

## Work

- Routes: `exercises/new` (accepts a `title` param from "Create ‹query›") and `exercises/[id]/edit`, presented as sheets.
- Form fields:
  - Name.
  - Equipment: the 9-cell icon grid, single select.
  - Primary muscle group: Body / List toggle (the body map from slice 3 when present; list otherwise).
  - Secondary muscle groups: multi-select, excluding the primary.
  - "How you log it": four plain choices (Weight and reps, Reps only, Time, Distance and time) plus "More" for the other five types. Locked with an explanation once a set references the exercise.
  - Notes (saved as `instructions`).
- Validation with the shared `customExerciseInput`; errors inline; the server stays the authority.
- Edits keep a per-field baseline and upload only changed fields (ADR 0019). Discard confirmation on a dirty close.
- Archive from the detail menu and by swipe in the Custom/Archived views; undo toast. Restore from the Archived view and the detail menu.
- Rejected writes surface through the existing notice, named by the exercise title.
- The tab action "New exercise" and "Create ‹query›" now open the form.

## Tests

- Unit: the form's dirty-field diff, type-choice mapping.
- Upload-path tests from slice 1 already cover the server; add one for a title at the limit.
- Native: adb screenshots light and dark of the empty form, a filled form, validation errors, the locked type, the Archived view.

## Done

All repo checks pass; screenshots attached.
