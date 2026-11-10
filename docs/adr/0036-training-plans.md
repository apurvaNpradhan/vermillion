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

Amended 2026-11-10 (slice 3): the description editor is a plain multi-line field, and the Markdown is rendered read-only with `marked`'s lexer into native text (`platform/ui/markdown.ts`), not `react-native-enriched-markdown`. Its compatibility table stops at React Native 0.87 (this app is on 0.88), it is an uncontrolled input, and its postinstall downloads assets that pnpm blocks. The text stored is Markdown either way, so the editor can be swapped later without a migration.

Amended 2026-11-10 (slice 4): superset rules the data model leaves open. A group is a run of consecutive exercises (`supersetRuns`); a group of one is cleared, and rest lives on the last member only. A row dragged next to nobody of its group leaves it; a row dropped between two members of one group joins it, so a drag never splits a pair. Leaving a group, or removing a member, hands the group's rest to whoever is left alone or last. Covers: the picked photo is cropped 1:1, resized to at most 1024 px and saved as JPEG in `documentDirectory/program-covers/<programId>.jpg`; the local-only `program_cover` table (id = program id, `program_id`, `uri`, `updated_at`) is cleared by the account wipe like every local-only table, whose lifecycle also asks the app to delete the files (`onWiped`), and the files are swept at start-up and once a deleted Program's Undo window has passed.

Amended 2026-11-10: identical working sets expand into an inline target row with a bounded
set-count stepper and rest field. The exercise sheet offers the same compact editor; warm-ups,
special set kinds and different targets retain the full table. Switching views never flattens
custom targets. Individual-set editing remains an explicit action. Set kind names, remove
controls and rep-range labels are visible. Reorder handles signal the existing hold-and-drag
interaction. Workout and Program lists expose their duplicate/delete actions through a menu as
well as swipe. "Reuse workout" explains that repeated Slots share one Workout, unlike a copy.
Session storage and future Start/Resume behavior are specified in [0037](0037-session-storage-and-training-entry.md).

Amended 2026-11-10 after Android device testing: the inline action is "Edit sets". Custom sets
stay in one table with no disabled compact-mode toggle. A rep value opens a labelled Exact reps /
Rep range picker; the mode is never a word between the bounds. Rest uses a HeroUI duration sheet
with snapping minutes/seconds, presets and Off. W marks warm-ups; all other sets share one sequence,
with D or T appended for drop or to-failure sets. Those types use category color tokens plus letters,
not color alone. Individual-set edits affect only that set; the compact editor applies targets to
all alike working sets. PanelUI source attribution and the component assessment are in
[the UI review](../panelui-review.md).

Amended 2026-11-10 after the editor follow-up: every exercise row expands inline, including
warm-ups and mixed targets. The inline and detailed editors share the same custom-set controls.
Only the explicit "Edit sets" action opens the detailed screen. Rep values have no chevron,
set badges have no instructional caption, and set removal is a left swipe, with full-swipe
removal enabled. The last remaining set cannot be removed; screen readers also receive the
remove action on the set badge. Only the visible drag grip starts reordering, so holding or
swiping a target control cannot reorder the exercises.

Train separates Workouts and Programs with counts and named creation actions. Programs show a
compact details card and a "Workout order" section. "Add day" groups adding/copying a Workout,
reusing one and adding Rest; the shared-edit explanation appears only in the reuse picker.

Amended 2026-11-10 after the final editor review: each exercise expands the same per-set table,
with only one exercise expanded at a time. This supersedes the compact all-alike editor and its
separate individual-set action. Cell edits affect one set; added sets copy the last training
target. This costs more taps for bulk changes but keeps edit scope consistent. The row menu's
"Exercise details" opens the roomier note and target editor. Workout title and note edits live
under "Edit details" in the workout menu; the header and preview have no rename link.

Workout tiles aggregate every exercise's primary and assisting muscles, independent of exercise
order. The preview includes the larger map and muscle names. This represents coverage, not volume
or recovery. Program identity remains its selected cover or initial. The trade-offs and next
priorities are in [the product review](../training-product-decisions.md).

Amended 2026-11-10 after comparing Train mockups: the selected unified layout replaces the
Workouts / Programs switcher. Train shows up to two compact Program rows and a View all route,
followed by standalone Workout cards. One header Create action offers both types; the duplicate
tab-bar action and collection descriptions are removed. The full Program library retains open,
duplicate, delete and Undo behavior. Program-owned Workouts continue to live inside their Program.

Amended after device feedback: Workout lists now use the same compact grouped rows as Programs,
with title initials replacing muscle tiles. Both share row typography, spacing and action
placement. Program rotation rows also use Workout initials. Aggregate muscle coverage remains
available in the expanded Workout details, rather than as the list's visual identity.
