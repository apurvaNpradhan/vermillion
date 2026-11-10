# 0036. Training plans: Programs, Workouts, Rotations

Status: accepted (2026-11-10). Builds on [0019](0019-synced-table-conventions.md), [0028](0028-native-navigation-shell.md) and [0034](0034-exercise-library.md). Specs: [docs/specs/training/](../specs/training/). Terms: Program, Workout, Session, Rotation, Slot, Cycle, Run, Active program, Planned set, Set kind, Superset, Effort and Pinned exercise note in [CONTEXT.md](../../CONTEXT.md).

## Context

After the exercise library, users need to plan their training: a single day's plan they can repeat, and a multi-week program (a push/pull/legs split, upper/lower) they follow for months. Two popular apps were studied from screenshots. Both use "routine" for the day plan and "workout" for both the plan and the logged training. Both open every exercise as a full set grid, so a seven-exercise plan is a long scroll of empty cells. Both offer a dozen set types, and "replace exercise" throws away its sets. One schedules programs by calendar, which makes a missed day "overdue". We want less effort to build a plan, a plan that tolerates real life, and history that never depends on the plan staying unchanged.

This ADR covers plans only. Sessions (live logging, the rest timer, progression, "last time" values) get their own design next, constrained here only by "a Session keeps its own copy of what was done".

## Decision

### Language

**Program, Workout, Session.** You build Workouts, you start a Workout, and the record of training is a Session. "Routine" is not used anywhere, including the UI.

### Ownership

- A Workout is **standalone** (`program_id` null) or **owned by exactly one Program**. "Add to program", "Save as standalone" and "Duplicate" all **copy** (new ids for the Workout and its exercises). There is no shared reference and no Move. Shared references cause "why did my other program change?", and a Move is a delete that history may link to.
- **Deleting is real.** Programs, Workouts and their children are soft-deleted ([0019](0019-synced-table-conventions.md)) with an Undo toast. Deleting a Program deletes the Workouts it owns. Sessions never read a plan for their content, so no history is lost. Delete wins: a plain put or patch of a deleted row is refused. Undo is an explicit restore (a put carrying a local-only `restore` marker), which revives only the rows that delete removed and only under a live parent.

### Program structure: a Rotation, not a calendar

- A Program is an ordered **Rotation** of **Slots**. Each Slot holds one of the Program's Workouts or Rest. One Workout may fill several Slots (Upper, Lower, Rest, Upper, Lower, Rest). Editing it changes every Slot it fills.
- **Cycles**: training a Workout from the Program marks its first untrained Slot in the current Cycle, in any order. "Next up" is the first untrained Slot. A Cycle completes when every Workout Slot is trained. Rest Slots are advisory: never marked, never blocking.
- **Runs**: an optional planned length (1–52 weeks). Progress is calendar weeks since the Run's first Session. When the length is reached, Train offers Finish (Completed), Keep going or Run again (a new Run; earlier Runs keep their dates).
- **One Active program** (or none) drives the next-up suggestion. Any Workout can be started at any time.
- Week-specific variation (deloads, RPE that rises week by week) is not modelled. It can arrive later as overrides on top of a Rotation without changing it.
- Rejected: a weekly calendar (missed days become overdue) and weeks × days grids (every Workout copied per week, so editing is painful).

### What a plan holds

- **Program**: title, description (Markdown, the only rich text), optional planned weeks, optional cover photo. There are no level, goal or days-per-week fields: days per week is derived from the Rotation, and level and goal only matter for a public catalog we don't have.
- **Workout**: title and a plain-text note. A null title shows a name derived from the primary muscles of its exercises ("Chest · Shoulders · Triceps"), so a new Workout has a name without typing.
- **Workout exercise**: exercise, rest time (null means off), a plain-text **Pinned exercise note**, an optional Superset group, and its **Planned sets**.
- **Planned set**: Set kind (`warmup`, `working`, `drop`, `failure`). Reps as a range (`min = max` for one number). Optional weight. Optional Effort range. Other targets (duration, distance, floors, steps) follow the exercise type's `SET_FIELDS`. Partials, myo-reps and the like are notes.
- **Effort**: stored as RPE, 6 to 10 in halves. Shown as RPE or RIR (10 − RPE) by a preference.
- **Weight**: stored in kilograms. A kg/lb preference converts for display and rounds to the unit's step, so 45 lb round-trips as 45 lb. A per-exercise unit override can be added later as a nullable column.
- **Rest**: per Workout exercise, prefilled from a default-rest preference adjusted by exercise type. Rest after warm-up sets is a fixed short value, not stored.
- **Supersets** exist in the data from the start: consecutive exercises share a group id. A circuit is the same with more than two.

### Ordering and sync

- `workout_exercise` and `program_slot` are **rows with a fractional position key** (a text key from `fractional-indexing`, ordered by key then id). Moving one item rewrites one row, so two devices reordering offline converge without duplicates or gaps. This follows 0019's rule against per-field merging of ordered lists.
- **Planned sets are a JSON array on their Workout exercise**, written as a unit. "3 × 8–10" is edited as a whole. Two offline edits of the same exercise's sets resolve last-write-wins for that exercise.
- One `training` vertical (server, sync package, native) and one per-user stream. The vocabulary (Set kinds, the Effort scale, limits) lives in `packages/shared/src/training/`. Sessions will join this vertical.
- Limits, enforced by the upload handler and shown in the UI: title 1–100 characters, notes ≤ 1,000, description ≤ 10,000, 40 exercises per Workout, 20 sets per exercise, 28 Slots per Rotation, 100 live Programs, 500 live Workouts.

### Media

The cover photo is a file in the app's documents directory, recorded in a **local-only** table. `program.cover_key` is synced and stays null until R2 uploads exist. Until then a second device shows the generated tile, and the Program says "Photo on this device only". Workouts have no photo: their tile is generated from the muscles they hit. Images are never synced as base64.

### Interface

- A **Train** tab (the second direct tab in the pill): the Active program card (next up, Start, Cycle progress), then My programs, then standalone Workouts.
- **Summary rows, not set grids.** Each exercise in the editor is one row: thumbnail, name, `3 × 8–10 · RPE 8–9 · 2:00` and the pinned note. Tapping it opens an exercise sheet where "All sets alike" is on by default (one row of targets, a set-count stepper, a separate warm-up count). Turned off, each set is edited on its own. Long-press drags to reorder, and every row collapses to one line while dragging.
- **Pick-first creation.** New Workout opens the library in pick mode. Each picked exercise gets defaults from its type (3 working sets × 8–12 for weight and reps, 3 × 30 s for duration, default rest). Edits save as they happen; there is no Save or Cancel. An untouched empty new Workout is dropped.
- **Replace** opens single pick with "Swap for" suggestions first. With the same exercise type, the sets, rest and note are kept. With a different type, sets reset to that type's defaults and the note is kept.
- **Share as text** through the system share sheet. Links, a community catalog and import come later.

### Not built yet

The Active program, Cycles, Runs and the end-of-Run moment ship after the Session design, because they depend on Sessions. The model above is fixed; the tables (`program_run`, Slot completion) are added then.

## Consequences

- A Session must copy what it needs (Workout title, exercises, sets). A plan can change or disappear at any time.
- Built-in template Programs can come later as Reference data copied on use, the same copy path as "Add to program". No third-party program is shipped: those are paid, copyrighted products.
- Adding week-specific overrides, per-exercise units, level and goal, or R2 covers is additive.
- Last-write-wins on a whole set array can drop a concurrent offline edit to the same exercise's sets. This is accepted: one person rarely edits one exercise's targets on two offline devices.
