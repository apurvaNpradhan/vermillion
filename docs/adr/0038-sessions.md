# 0038. Sessions: live logging, timers, records and history

Status: accepted (2026-11-10). Builds on [0036](0036-training-plans.md) and [0037](0037-session-storage-and-training-entry.md). Specs: [docs/specs/sessions/](../specs/sessions/). Terms: Session, Logged set, Ghost value, Previous, Tick, Rest, Take over, Record, Gym equipment, Run and Cycle in [CONTEXT.md](../../CONTEXT.md).

## Context

Plans exist; training does not. A popular app was studied from 48 screenshots of a real session. Its logging grid, rest bar and plate calculator work well. Its weak points are worth avoiding:

- Every exercise is open at once, so a seven-exercise session is about 40 rows.
- A set can be ticked with 0 reps. Finish then interrupts with an "invalid sets" dialog.
- Warm-ups inflate session volume.
- History, records and charts live on tabs; the longer ranges are paywalled.
- The exercise image sits under an opaque header that the camera cutout overlaps.

We want the shortest path from "I did the set" to a correct record, numbers that mean something, and history that never depends on the plan.

ADR 0037 fixed the storage constraints. This ADR fixes the behavior and the remaining data.

## Decision

### Logging screen

- **Accordion, one exercise open.** Collapsed rows read "2/4" or "4/4 · 60 kg × 8, 8, 7, 6". The session opens on the first unfinished exercise. Ticking an exercise's last set collapses it and opens the next. Any row can be opened out of order. This is the editor's accordion, so planning and training look alike.
- **Supersets** open as one block. Ticking a member's set moves the highlight to the next member's matching set. Rest starts after the last member of the round, matching 0036's "rest lives on the last member".
- **In-session edits** use the editor's rules: replace (same type keeps the sets), add to or leave a superset, pinned note, remove, reorder by grip, add exercises in pick mode, and change the set kind from the badge. The source plan is not touched until Finish.
- **Header**: a collapse chevron, the elapsed time, live volume and set counts, a body icon for muscle distribution, and Finish. There is no separate clock or stopwatch tool.

### Ticking, Previous and Ghost values

- **Previous** is the actual set from the most recent completed Session with the same exercise. It may come from any Workout, and is matched by set kind and position: warm-up 1 to warm-up 1, working set 2 to working set 2. Tapping Previous copies that set into the row.
- A **Ghost value** fills each empty cell.
  - Weight, duration and distance ghosts are the Previous value, else the planned target.
  - The reps ghost is the Previous reps when they fall inside the planned range, else the range's lower bound.
- **Ticking adopts the ghosts** into empty cells, so one tap logs "same as last time". A tick is refused only when a required field (`SET_FIELDS`) has neither a value nor a ghost. The row shakes and highlights the field. An empty or invalid completed set therefore cannot exist, and there is no invalid-sets dialog.
- Unticked sets are dropped at Finish. The confirmation states how many.
- After a replace, Previous and the ghosts come from the new exercise's own history. Untouched sets that aren't ticked get fresh ghosts.
- **Effort** shows as a column only when the plan has an effort target or the user turns it on for that exercise. It is never required, its ghost is the planned effort, and it displays as RPE or RIR by preference.

### Number entry

Set cells use an in-app keypad, not the system keyboard. It has digits and a decimal point, − and + steps, Next (weight → reps → the next set's weight), Done, and a plate-calculator chip on barbell-type exercises. Weight steps are 2.5 kg / 5 lb for barbell-type equipment and 1 kg / 2.5 lb otherwise. This avoids the Android IME problems found in the editor and gives step and plate shortcuts.

### Rest and timers

- Ticking a set starts its rest: the exercise's rest, or 0036's fixed warm-up rest after a warm-up. Rest Off starts nothing.
- A new tick replaces a running rest. Unticking the set that started it cancels it.
- A bottom bar shows the countdown, −15, +15 and Skip, with a thin progress line.
- The source of truth is `session.rest_started_at`/`rest_ends_at` (0037). A local notification is scheduled for the end time when rest starts and is rescheduled or cancelled on every change, so it fires even if the app is backgrounded or killed. This adds `expo-notifications`.
- Notification permission is requested the first time a rest starts, after a one-line explanation. If it is denied, the in-app bar and haptics still work. Settings → Training links to the OS setting.
- **Duration sets** get an inline play button. With a target, it counts down and ticks itself at zero. Without one, it is a stopwatch you stop to tick. `session_set.timer_started_at` makes it survive backgrounding. Values can always be typed instead.
- While the session screen is in the foreground, `expo-keep-awake` keeps the screen on (a preference, on by default). Haptics: light on tick, stronger at rest end, success on a Record.
- **Rest-end chime (amended 2026-11-11, was "no sounds").** Rest end also plays a short chime (uisfx "zen" notification, CC0, `assets/sounds/rest_end.wav`), both in the app (`expo-audio`, preloaded, with the haptic) and in the background notification. A user asked for an audible cue because a buzz in a pocket or on a bench is easy to miss. It respects the phone: `playsInSilentMode: false` and mixing with other audio in the app, notification audio usage on Android, so silent, ringer and Do Not Disturb win. The setting "Rest timer sound" (`ui.restSound`, default on) turns it off, leaving vibration only. Android fixes a channel's sound at creation, so there are two channels, `rest-timer-sound` and `rest-timer-silent`, and the old `rest-timer` is deleted; changing the setting reschedules pending notifications.

### Session lifecycle

- **One active Session per account** (`finished_at` null, not deleted). Starting another asks to resume the active one or to discard it and start the new one. A Session can also start empty.
- **Minimising** shows a Resume bar above the tab pill, with the elapsed time and the current exercise.
- **Discard** asks for confirmation and soft-deletes with Undo.
- **Take over**: a Session records its `device_id`. Another device shows "In progress on another device" with Take over, which writes its own id. The former device then shows the Session read-only, labelled "Continued on another device".
- **Two Sessions started offline** both reach the server; it has no uniqueness rule, because refusing one would lose a real workout. A device holding two active Sessions lists them and lets the user finish, discard or resume each. Nothing is deleted automatically.
- **Forgotten sessions**: opening the app more than 3 hours after the last tick offers to finish at the last tick plus its rest, keep going, or discard. Nothing finishes in the background.
- **Title**: a snapshot of the source Workout's title. Empty and backfilled Sessions use the muscle-derived name (0036), recomputed until the user renames the Session.

### Finish

1. **Summary**: duration, volume, sets and Records; editable title, note, start date/time and duration. Unticked sets are listed as not saved.
2. **Update Workout?**: shown only when the Session came from a Workout and differs from it. It has two independent toggles, each with a short diff, both off by default.
   - **Structure**: exercises added, removed, replaced or reordered; set counts and kinds.
   - **Targets**: planned weight becomes the last working set's actual weight. Rep ranges and effort are never rewritten from actuals.

   If the Workout was deleted, this step offers "Save as new Workout" instead.

3. **Celebration**: Record cards and Share as text.

There is no photo, gym, visibility or tagging step.

### Numbers

- **Warm-ups are logged and shown but excluded from every number**: volume, set counts, muscle distribution and Records.
- **Volume** = Σ effective weight × reps over working, drop and failure sets. Effective weight depends on the exercise type:
  - weighted types: the logged weight
  - bodyweight types: the bodyweight preference
  - assisted types: bodyweight minus the assistance, floored at 0

  Without a bodyweight, bodyweight and assisted exercises count reps only, and the user is prompted once to add a bodyweight.

- **Records**, per exercise and computed when read, never stored:
  - heaviest weight
  - estimated 1RM (Brzycki, sets of 1–12 reps)
  - best set volume
  - best session volume
  - rep records: heaviest weight for each rep count from 1 to 12
  - for timed and distance types: longest duration, longest distance and best pace

  A set is a Record when it beats every earlier Session's sets of that exercise, ordered by Session start. Because Records are computed, editing or deleting old Sessions keeps them consistent.

- **Muscle distribution**: each counted set adds 1 to its exercise's primary muscle and 0.5 to each secondary muscle. It is shown as the body map in intensity mode plus a ranked bar list, labelled as sets, never as percentages.

### History, detail and editing

- **Session detail**:
  - title, date and source link
  - stats: duration, volume, sets, Records
  - muscle distribution
  - each exercise's sets with Record badges, effort and notes

  Menu: Edit, Save as Workout, Share as text, Delete with Undo.

- **History** is a route in the switcher menu: a reverse-chronological list grouped by week, each week header showing its sessions, sets and volume. Its header holds "Log past workout". There is no calendar grid.
- Finished Sessions are fully editable. **Log past workout** creates a finished Session at a chosen date with no timers. Next up and "last done" follow the Session date.

### Exercise page and Workout preview

- **Exercise page** keeps 0034's single adaptive scroll with no tabs. The hero media runs under a transparent header that fades in as you scroll. Below it:
  - title and muscles
  - your numbers: a chart with metric chips (heaviest, estimated 1RM, best set volume, session volume, total reps)
  - the Records list
  - the last 3 Sessions, with See all
  - How to
  - Swap for

  Before any history exists, How to moves up and the numbers section collapses to one line.

- **Charts** are our own `react-native-svg` line and bar charts. Scrubbing reads a point, the adaptation of PanelUI's LineChart is attributed, and the ranges 3M, 1Y and All are all free. No Skia or chart dependency is added.
- **Workout preview**: tapping a Workout opens a read-first preview, not the editor. It shows "Last done …", **Start** as the primary action, a chart (Volume, Reps, Duration), exercise summaries with last-time values, and Edit in the header.

### Plate calculator and Gym equipment

- The keypad chip opens a sheet with a side-on SVG of one side of the bar, coloured by plate. It solves greedily from the largest available plate within the plate counts. When the target cannot be loaded it shows the closest loadable weight with Use.
- **Gym equipment** is a synced per-user list of bars and plates. A default kg or lb kit is seeded on first use; items can be toggled, and custom bars and plates (weight, label, count) can be added. This is a plate inventory, unrelated to 0034's "no custom equipment" taxonomy decision.
- The chosen bar is remembered per exercise in `exercise_setting`.

### Programs: Active program, Runs and Cycles

0036's deferred pieces ship as the last slice.

- Set active or Stop from a Program; only one is active, and switching asks for confirmation.
- Train's top card shows the Active program: title, "Week 3 of 8", Cycle dots, Next up with Start, and Change.
- The end-of-Run sheet (Finish, Keep going, Run again) appears on the next Train visit after the planned length, never mid-session.
- **Slot completion is derived, not stored**: a Session started from a Program carries `run_id`, `slot_id` and `cycle`, and the Cycle state is computed from those.
- **Home**: Resume, Next up, This week (sessions, sets and volume against last week, with an 8-week bar chart), Muscles this week, then Recent sessions. Empty sections hide; a new account sees one "Start your first workout" card.

### Data

All rows are owned and synced in the `training` vertical and stream, and use UUIDv7, soft delete with explicit restore, and fractional positions (0019, 0036). The upload handler validates ownership through every parent.

| Table              | Columns beyond the conventions                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`          | `workout_id?`, `program_id?`, `run_id?`, `slot_id?`, `cycle?`, `title`, `title_derived`, `note`, `started_at`, `finished_at?`, `duration_s?` (override), `device_id`, `rest_set_id?`, `rest_started_at?`, `rest_ends_at?`        |
| `session_exercise` | `session_id`, `exercise_id`, `exercise_title`, `exercise_type` (snapshots), `source_workout_exercise_id?`, `position`, `rest_seconds?`, `note`, `superset_group?`, `log_effort`                                                  |
| `session_set`      | `session_exercise_id`, `position`, `kind`, `weight_kg?`, `reps?`, `duration_s?`, `distance_m?`, `floors?`, `steps?`, `rpe?`, `completed_at?`, `timer_started_at?`, `target` (planned-set JSON snapshot)                          |
| `gym_equipment`    | `kind` (`bar`, `plate`), `weight_kg`, `unit` (`kg`, `lb`, the kit it belongs to), `label?`, `count?` (plates; null = unlimited), `enabled`                                                                                       |
| `exercise_setting` | `exercise_id` (unique per user), `bar_id?`, `log_effort`                                                                                                                                                                         |
| `program_run`      | `program_id`, `activated_at`, `started_at?` (its first Session), `finished_at?`, `outcome?` (`completed`, `stopped`). The Active program is the one with an unfinished Run; activating another finishes the old Run as `stopped` |

A completed set is one row write (0037). Bodyweight joins the synced preferences.

Limits: 40 exercises per Session, 20 sets per exercise, title 1–100 characters, note ≤ 1,000, duration override ≤ 24 h, and a backfilled date between 10 years ago and now.

### Deferred

Progression suggestions, Apple Health / Health Connect, a watch app, Live Activities and an ongoing Android notification, a per-exercise unit in sessions, a dated bodyweight log, session photos, image share cards and a warm-up generator. Warm-ups are logged as ordinary W sets.

## Consequences

- Previous values, ghosts and Records are queries over local `session_set` rows. They need indexes on `(exercise_id)` through `session_exercise` and on `session.started_at`. For the history sizes we expect (hundreds of Sessions), computing on read is cheap; a cache can be added later without changing the model.
- Excluding warm-ups makes our volume differ from other apps for the same workout. This is intended and explained in the Records help.
- `expo-notifications` and `expo-keep-awake` are new native dependencies and need a dev-client rebuild.
- Deriving Slot completion from Sessions means deleting a Session can un-train a Slot. This is correct: the Cycle reflects what was actually done.
- A custom keypad must carry its own accessibility labels and hardware-keyboard support.
