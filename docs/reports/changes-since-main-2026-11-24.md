# Changes since the last push to main

Everything on `feat/redesign` after `origin/main` (`2def03390`, merged 2026-11-24 11:06): 230
commits (196 without merges), 560 files, +44,786 / −4,744 lines. Nothing here is pushed or
deployed. Written 2026-11-27 by the orchestrating agent while the owner was away; the owner said to let the agent take the decisions, and every one
is listed in [Decisions taken while you were away](#decisions-taken-while-you-were-away).

## Before you ship

1. **Phone pass first.** No agent ran the app on a device this round: the installed Android dev
   client fails to load `libreactnative.so`, so rebuild it first. Then use
   [Check on the phone](#check-on-the-phone).
2. **Deploy the API before the app.** The app now speaks sync schema version 2, sends
   `deload_change` and `hintDismissal`, and relies on new columns. An older API answers version 2
   with "client incompatible" and the device keeps its queue, so the order matters but a mistake
   does not lose data.
3. **Migrations** (all additive) run with the API deploy — see [Migrations](#migrations).
4. **After the API deploy:** run `scripts/ops/repair-run-started-at.sh` as a dry run, then with
   `--apply`. The server now never moves a Run's start later, so one run is enough
   ([runbook](../runbook.md)).
5. **Catalog media:** upload the media for catalog patch 0004 (47 new exercises).

## What changed, by area

### Train, Programs and Workouts

- Train redesigned: active-program card, two-column program grid with ⋮ actions, workouts outside
  a program with search and sort.
- Workouts are edited directly; rename from the preview; workout covers like program covers.
- Skip a day "this time" from the day strip, with Undo; done/skipped/next marks.
- Program page: cover, one status line ("Active · Week 3 of 12") or "Set as active", a **Weeks**
  row and the rotation. Pause, Stop, Share, Duplicate, Delete live in ⋮ only.
- **Plan your weeks**: one screen for length, the repeating pattern (chips, "+ Week", usual
  patterns), per-week changes on the strip, and what each phase does. Saves as you go.
- Train week chip opens a sheet: this week's phase and effect, **Deload this week** / **Undo
  deload**, Pause program, Plan your weeks.
- "Week N · Workout M" everywhere (rest days no longer counted on Home).

### Week phases and deloads

- Build, Push, Test, Deload phases per Run week, a repeating pattern, per-week overrides, editable
  phase effects, Test work-up singles; Test singles seeded from estimated strength.
- Pause and resume a program (paused days do not count).
- One **Deload this week** action replaces "Insert deload" and "Lighter week"; Undo until a
  workout is logged in it (server enforces this too).

### Gyms, loads and equipment

- Gyms (hidden while you have one; limit 10): per-gym Max load, Load step and setup note; the
  Session's gym drives caps, steps, plates and warm-ups; same-gym history for machines.
- Load grid: suggestions snap to loads the gym can make; caps with an extended rep ceiling.
- Equipment here and a dumbbell max per gym; swaps ranked by what the gym has ("Not here").
- In-Session prompts learn a machine's max and step after you override twice.

### Training engine

- `prescribe()` façade used everywhere; named rules per exercise (Double, Linear, Top set +
  back-offs, Maintain) with a preview; reasons show their evidence.
- Prescription snapshot per Session exercise; same-day adjustment after a missed set; suggested
  vs done on finished exercises; stalls also count three missed suggestions.
- More reps before a big load jump; RPE-aware estimated 1RM; assisted, timed and weighted
  bodyweight progression; per-exercise kg/lb.

### Live Session

- Set actions (Fill remaining, Remove, Max load and setup) in the set-number sheet; swipe stays a
  shortcut. Shorter ⋮ menu with a Note sheet and an Exercise settings sub-sheet.
- Pause workout; one Warm-ups screen (calculator + count warm-ups), reachable inside the Session.
- Live notification uses the Session day's bodyweight.

### Exercise library and catalog

- Favourite exercises (formerly "pinned"), body-map muscle filter under Filters, "Available here".
- Catalog patch 0004: 47 exercises (gaps, mobility, staples) and alias fixes.

### Home, History, Body, Settings

- One day-mark style on Home, Train and the Active program card; Start stays visible when you tap
  a day; ‹ › arrows on week strips.
- One Resume (the bar above the tabs); "Start empty workout" as a text link, hidden while a
  workout is open. Deload nudge says what it does.
- Delete weigh-ins, measurements, photos, plates and editor sets from their sheets.
- Notifications screen: training reminders, monthly report, rest vibration, cue volume.
- "Your record" export: JSON backup (now including gyms, pins, skips and the new columns) and body
  CSVs.
- Equipment always one tap from Settings; "Show tips again".

### Hints

- Three once-only notes: Plan your weeks (what phases mean), the Train strip, the first set row
  (grey suggestions, tick, set number). They close on "Got it" or when you do the thing, sync
  across devices, and replay from Settings.

### Entry guards

- **Check this set / Check this weigh-in** ([spec](../specs/training/entry-guards.md)): a quiet
  confirm when a typed value is far outside your history (e.g. 1000 kg on a 100 kg lift, a kg/lb
  slip, reps typed into the weight box, a weigh-in far off trend). Change, Keep, or Swap. Never
  blocks; values the app filled itself are not checked; a kept set is not asked again.
- **Start it again?** when you start a workout already finished today.
- Duplicate exercises were already blocked in the picker, so no extra question was added.
- Review fixes: an edited typo in a past workout cannot become its own reference; copied values
  are not questioned; warm-ups, drop sets, assisted loads and real PRs do not trigger it;
  backdated weigh-ins compare with that day's trend; thresholds work in displayed pounds.

### Removed

- Share links, the Shared links page and "Enter code" import (phone QA round, 2026-11-26).
  Sharing is image cards only. The API's share endpoints and ADR 0058 remain; the app no longer
  calls them (see Later).

### Fixes worth knowing

- Auth: keyboard no longer opens over the welcome animation; Google sign-in recovers after a
  cancelled browser flow. Swipe rows no longer close themselves on Android.
- Sync: deload undo survives two devices and old clients; hint dismissals merge; a Run's start
  never moves later; the schema version guards API rollbacks; gym delete scoped to the owner.

## Migrations

All additive (`packages/db/src/migrations`):

| Migration                                 | Adds                                                        |
| ----------------------------------------- | ----------------------------------------------------------- |
| 20261124174226_workout_cover              | workout cover media                                         |
| 20261124175031_program_slot_skip          | skip a day for one cycle                                    |
| 20261125052756_cover_cleanup              | cover media cleanup job state                               |
| 20261125060411_gyms                       | gyms, gym equipment, per-gym exercise settings, session gym |
| 20261125063801_exercise_pin               | favourite exercises                                         |
| 20261125070447_gym_equipment_availability | equipment here, dumbbell max                                |
| 20261125104735_week_phases                | phase plans, phases on runs/workouts/sessions               |
| 20261125111707_exercise_weight_unit       | per-exercise kg/lb                                          |
| 20261125164053_training_engine_e2         | engine round 2 columns (pauses, stall deloads)              |
| 20261125173909_training_prescription      | prescription snapshots                                      |
| 20261125194408_exercise_progression_rule  | named progression rule per exercise                         |
| 20261126164128_run_deload_undo            | `program_run.undone_deloads`                                |

## Pre-release audits (2026-11-27)

Three Opus audits of this whole range: [server, sync, security](audit-a-server-sync-security-2026-11-27.md),
[engine and shared](audit-b-engine-shared-2026-11-27.md), [native](audit-c-native-2026-11-27.md).
No critical findings and no ownership holes.

Findings fixed before release (each with a test where it is logic):

- **Server/sync (A):** a Run's start never moves later (enforced in the SQL update, so the repair
  cannot be undone by a stale upload); sync schema version 2 so an API rollback keeps phones'
  queues; 10 live gyms per account; gym delete scoped to its owner; export now covers gyms, pins,
  skips and every new column (a test compares it with `sync-config.yaml`); the repair script
  matches Session and Run owners and guards against concurrent earlier starts.
- **Engine (B):** no NaN back-offs at +0 kg; belt-plate rounding for weighted bodyweight;
  rule preview matches the engine; weighted Test singles; warm-ups ignored by the any-workout
  baseline; same-day misses step down on the dumbbell rack; stall check linear and memoised;
  undo-deload check under 100 reads on 500 Sessions (was ~10,000); Undo allowed until a Session
  starts as the Deload, same rule on phone and server; a 100% Deload adds no weight and respects
  caps; custom patterns continue after an inserted Deload and Home does not offer a Deload during
  a scheduled one; Test skip after 14 calendar days.
- **Native (C):** live Session rows no longer re-render every tick (stable `onLimits`);
  Equipment in a Session opens the Session gym's kit; the live notification uses the Session
  day's bodyweight; one gym question at a time; 44 pt gym chip; Plan your weeks opens on the
  current week; "grey suggestions" instead of "ghost values".

## Final check (2026-11-27)

`pnpm db:start`, lint, typecheck, knip, i18n:check and `pnpm test --concurrency=2 --continue`
(21/21 tasks) all pass on the final `feat/redesign` head.

## Check on the phone

No agent could run the app this round. Check, in this order:

1. **Live Session speed:** with the rest timer running, rows do not flicker or lag (audit C1).
2. **Train:** week chip → sheet; Deload this week, then Undo; Pause program; the strip hint
   closes on the first day tap; skip a day "this time" and undo.
3. **Plan your weeks:** opens on the current week; chips, "+ Week", presets, tap a week; fast
   taps do not lose edits; removing the last chip keeps settings.
4. **Program page:** status line or "Set as active"; ⋮ holds Pause/Stop/Share/Duplicate/Delete.
5. **Session:** tap the set number → Fill remaining, Remove, Max load and setup; Note sheet;
   Exercise settings; Warm-up settings opens inside the Session; switch the gym chip then open
   Equipment — it is that gym's kit; first-set-row hint.
6. **Entry guards:** type 1000 on a 100 kg lift and tick → "Check this set"; Keep / Change /
   Swap; start a workout you finished today; add an exercise twice.
7. **Home and History:** day marks, Start stays visible after tapping a day, ‹ › arrows, one
   Resume, Start empty link hidden while training.
8. **Deletes:** weigh-in, measurement, photo (viewer), plate/bar, editor set — each with Undo or
   a confirm.
9. **Hints:** each shows once, closes on "Got it" or the action, "Show tips again" in Help.
10. **Two devices:** dismiss a hint on one, it stays closed on the other; Undo deload on one
    while the other is offline.

## Decisions taken while you were away

The owner asked the agent to decide while away (2026-11-26/27). Each can be overturned.

**Process**

- Committed the phone-QA thread's uncommitted work (image-only sharing, filter, icon swipes, cap
  revision) as its own commit `995b93674` before building on it, after the full gate passed.
- Merged each slice locally before its review so the next slice could build on it; review fixes
  merged after.
- When Codex or Claude hit a usage limit, cancelled the task and handed its worktree to the other
  model at once (see [agent slices](../guides/agent-slices.md)).
- API tests: 6 workers and a 60 s timeout (they clone a database per file and timed out at random
  with one worker per thread). `pnpm db:start` runs MinIO's one-shot apart so it exits 0.

**Product**

- "Show tips again" sits under Help in Settings (there is no General section).
- The Session's "Add warm-ups" stays an instant action; the one Warm-ups screen holds the settings.
- New tap-to-delete buttons behave like the swipe they mirror (Undo toast, no extra confirm;
  photos keep their confirm sheet).
- Undo deload: allowed until a Session starts as that Deload (not merely in that week), same rule
  on phone and server; the upload carries an explicit add/undo for one week and the server keeps
  undone weeks so older phones cannot bring them back.
- Removing the last pattern chip keeps per-week choices and phase edits as one Build week.
- 10 live gyms per account; sync schema version 2 (1 still accepted); a Run's start only ever
  moves earlier; run the repair script once after the API deploy.
- Entry guards ([spec](../specs/training/entry-guards.md)): thresholds ×1.5 and +20 kg over the
  heaviest completed working load, equipment ceilings with no history, the 2.2× unit slip,
  reps over 50, swapped fields, weigh-ins 7% / 3 kg off trend; never blocking; kept values count.
  Also "Start it again?" for a workout already finished today and "Already in this workout".
- Audit verdicts: fixed every FIX NOW item; LATER and SKIP items are listed below unchanged.
- Left the API's share-link endpoints and ADR 0058 in place although the app no longer uses them.

## Later

- **Phone build:** the installed Android dev client fails with `couldn't find DSO to load:
  libreactnative.so`; rebuild the dev client (`expo run:android` or a new EAS dev build) before the
  phone pass.
- **Native (audit C):** gym prompts open 2–6 SQLite watches per exercise and appear late (4);
  the screen subscribes to every exercise view for the phase banner (9); the set-row hint grid
  remounts when the first exercise moves (10); preference writes re-run the reminder and live
  notification hosts (11); `useExerciseProgression` recomputes every render (12).
- **Server (audit A):** F7 gym PUT resets availability when fields are absent; F8 an older app's
  Session PUT clears `gym_id`/`phase`; F9 token renewal takes the training lock; F10–F11 cover
  sweep cost and 7-day bucket lag; F12–F13 seam-3 and cover-cleanup test gaps. SKIP: F14–F16.
- **Engine (audit B):** A13 grind holds below plan; A14 Deload on a coarse stack keeps full load;
  A15 a small jump to a cap resets reps; A16 the extra rep at a cap counts as missed; A17 the
  14-day break rule lives in four places; A18 unknown rule options read as Double on older builds;
  `trainingBreak` has no time zone; one shared bodyweight lookup for both sync paths. SKIP: A19.
- **Clean-up:** remove the unused share-link API and supersede ADR 0058.
- **Flaky under memory pressure:** native test workers are sometimes SIGKILLed when several agents
  test at once on the 14 GB machine; every file passes alone.
- **Roadmap:** grill Starter Programs; Health Connect writes; %TM / waves after using phases
  ([research](../research/percent-waves-readiness.md)).
