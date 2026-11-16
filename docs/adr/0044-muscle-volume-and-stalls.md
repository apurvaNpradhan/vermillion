# 0044. Muscle volume targets, stalled lifts and Lighter weeks

Status: accepted (2026-11-17). Builds on [0038](0038-sessions.md). Terms: Muscle volume, Muscle goal, Stalled lift, Lighter week in [CONTEXT.md](../../CONTEXT.md).

## Context

Sets and volume are counted per Session and per muscle ([0038](0038-sessions.md)), but nothing says whether a week of training is enough, and a lift that stops improving looks the same as one that is going well.

## Decision

### Muscle volume and goals

- Muscle volume is the Counted sets per muscle over a Week (`weekRange`, the one week definition): 1 for the exercise's primary muscle, 0.5 for each secondary. A Session belongs to the week it started in. Not shown in the live Session.
- 12 muscle groups carry a target: chest, upper back, lats, shoulders, biceps, triceps, traps, abdominals, quadriceps, hamstrings, glutes, calves. Forearms, neck, lower back, abductors and adductors work as secondary muscles in most lifts, so they count and show on the body map but have no target.
- A Muscle goal is a level with a weekly range in sets: Maintain 6–10, Grow 10–20 (the default), Focus 16–24, or Custom with a typed min and max (whole numbers, max at least min, at most 60). Status: below under the minimum, on target within the range, above over the maximum.
- Goals are the `muscleGoals` map in the `ui` preferences (only changed muscles are stored). No migration.
- Screens: Muscles (from Home and History) with a week switcher and a goal sheet, and one Home tile.

### Stalled lifts

- Per exercise, in the history of the same Workout (`historyForWorkout`): the best Counted set of each Session by estimated 1RM (reps-only lifts: best reps; weighted bodyweight: effective weight). Stalled when the best of the latest three Sessions has not beaten the Session before them by 1%, and none of the three came after a gap of 14 days or more. At least four Sessions are needed. The count keeps growing while the stall lasts.
- The Session and the Workout preview show one quiet line. Tapping it makes today's suggestions 90% of the last load at the bottom of the range (`deload`). It changes suggestions only, never a tick or a typed value. The cross hides it until the exercise has a newer Session. Both choices are stored on the device, keyed by exercise and its last Session id.

### Lighter week

- When three or more exercises trained this week have stalled, Home suggests a Lighter week. Accepting stores `deloadUntil` (7 days ahead) and appends the period to `lighterWeeks`; "End now" clears `deloadUntil` and cuts the period short. Dismissing hides the card until the next week.
- While one runs every suggestion is 90% of the last load, and the sets after the first half of the non-warm-up sets stay in the plan, muted and labelled "Optional this week".
- Sessions that started inside a period are detected from `lighterWeeks` (no per-Session mark, so no migration and no write at Finish). They are never the baseline for the next suggestion or for stall detection, so normal progression resumes from the pre-lighter loads. The break rule still measures from the latest Session of any kind.

## Consequences

- Both lists of Lighter weeks and goals sync through the preferences row like the other `ui` fields; a period older than the 26 kept loses its exclusion, which only matters for Sessions older than half a year.
- Ending a Lighter week early edits its period, so Sessions after the end count again.
- A stalled-lift deload does not reach the Android live notification's ghost values.
