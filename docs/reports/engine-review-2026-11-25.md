# Training engine review, 25 November 2026

Deep review of Sigil's training engine at `feat/redesign`, head `12f01f239`. Written review only:
no source file was changed. Terms follow [CONTEXT.md](../../CONTEXT.md); the brief is section 7 of
[gyms-phases-train-round](../specs/training/gyms-phases-train-round.md).

**Scope.** `packages/shared/src/training` (progression, steps, load grid, stalls, Lighter week,
phases, cycle, planned sets, plates and bar choice, logging and history, volume and muscle
targets, records and e1RM, warm-up ramp, vocabulary and units) and its consumers: the Session
store, phase inputs and watches in `packages/sync`, and in `apps/native` the Session derive,
logging ghosts and state, warm-ups, plates, Workout preview, exercise page progression and the
Android live notification.

**Evidence.** Three kinds, marked on each finding:

- _probe_: a throwaway vitest file run in the session scratchpad against the code at HEAD, with
  the numbers quoted (key outputs are in the appendix). Nothing was added to the repository.
- _code_: read in the source, with `file:line`. Line numbers can move as other agents edit.
- _web_: competitor behaviour, cited. Vendor pages describe themselves; weaker sources are marked.

The existing engine suite passes: 39 files, 721 tests (`vitest run src/training` in
`packages/shared`).

**Paths.** Engine files are written from `packages/shared/src/training` (`progress/progression.ts`),
native files from `apps/native/src` (`session/store/derive.ts`), and sync files in full
(`packages/sync/src/training/...`).

**Scales.** Severity: High = wrong prescription for common users, blocks progress or logs a wrong
value; Medium = wrong for a sizeable group, or confidently misleading; Low = edge case or polish.
Cost: S = a day or two, one module; M = several modules or a small migration; L = new model,
UI and migration. Risk is the chance the change itself breaks something users rely on.

---

## Summary

The engine is pure, well factored for its size and carefully tested at the unit level. Its gym
model is a real strength: loads snap to what a gym can make (ranges, the loaded bar from the
gym's plates, a dumbbell rack, caps with a rep ceiling), and phases are snapshotted on each
Session so a plan edit never rewrites the past. Few logging apps get this far, and Sigil does it
on the device.

The weak point is the step from single rules to sequences. Following the engine's own
suggestions for a few weeks exposes behaviour no unit test looks at:

1. **A lifter who logs effort honestly can stop progressing for good.** Any set logged at
   RPE 9.5 or harder holds the load, every time, even when the plan asked for RPE 10 or it was
   a Push week (`progression.ts:91, 314, 337`). The copy promises "once more".
2. **The stall detector fires in the middle of normal double progression.** With 3 × 8–12,
   doing exactly what the engine suggests is flagged "Stalled for 3 sessions" every fifth
   Session, because Brzycki's e1RM drops when reps reset after a load jump.
3. **"Try 90% today" compounds.** The note comes back the next Session; accepting again gives
   81% (80 kg from 100), and the live notification ignores the applied deload altogether.
4. **Several defaults suggest loads nobody has.** The seeded kg gym kit includes 0.5 kg plates,
   so barbell jumps are 1 kg grained (60 → 62, 100 → 103, 140 → 144); machines without a Load
   step add 1 kg (50 → 51); a per-exercise lb override with a kg increment gives 100 → 105.5 lb.
5. **Five surfaces build the engine's context five ways.** The Session, the notification, the
   Workout preview, the exercise page and Session start each assemble history, gym, phase and
   deload inputs themselves; three of them already disagree.

Most fixes are small and local. The larger opportunity is to make the engine explain itself
with evidence, remember what it suggested, and offer a small set of named rules (double,
linear, top set with back-offs, maintain) instead of one rule with switches. That is where
Sigil can be clearly better than the logging-first apps without becoming a black-box coach.

### Top 15 recommendations

| #   | Recommendation                                                                                                                                  | Fixes           | Value | Cost | Risk    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----- | ---- | ------- |
| 1   | Judge effort against the set's own target: hold only when a set was clearly harder than asked, and at most once in a row.                       | B1              | High  | S–M  | Low–Med |
| 2   | Redefine a stall as "no better performance" (more load at the bottom of the range, or more reps at a load), not a 1% e1RM gain.                 | B2              | High  | S    | Low     |
| 3   | One deload per stall episode: record it on the Session (synced), leave that Session out of stall scoring, keep the note quiet while rebuilding. | B3, B4          | High  | M    | Low–Med |
| 4   | One context builder and one `prescribe()` entry point for the Session, notification, preview, exercise page and Session start.                  | B4, B10, §5     | High  | M    | Med     |
| 5   | A set added mid-session (or newly planned) must not hold back the sets that had a counterpart last time.                                        | B5              | Med   | S    | Low     |
| 6   | Realistic steps: fractional plates off by default and never sizing the automatic jump; increments in the exercise's own unit.                   | B6, B7          | Med   | S    | Low     |
| 7   | Treat the top of the kit or grid as a cap (reps climb, then the "add a set" hint), with copy that names the plates.                             | B8              | Med   | S    | Low     |
| 8   | Make every reason honest: split "hold" into its three causes, state the real deload percentage, and show the evidence (date, sets, rule).       | B11, §4         | High  | S–M  | Low     |
| 9   | After two misses at a grind, drop to a load estimated for the bottom of the range instead of holding forever.                                   | B9              | Med   | S    | Low–Med |
| 10  | Ask once for a machine's step ("What does this stack go up by?"), like the cap prompt; use loadable defaults for dumbbells, bells and belts.    | B12, B22        | Med   | S–M  | Low     |
| 11  | Make the Test week test: seed the single from e1RM (an RPE 8–9 single), respect breaks, and let the result update the lift's e1RM.              | B15             | Med   | M    | Low     |
| 12  | Quiet same-day adjustment: after a working set misses or beats the target by two reps, re-suggest only the unticked sets of that exercise.      | §2, §3          | High  | M    | Med     |
| 13  | More reps before a big jump on coarse grids (dumbbells, stacks): extend the ceiling when the next load is more than about 10% heavier.          | §2              | High  | S–M  | Low     |
| 14  | Store a prescription snapshot per Session exercise: suggested versus done, reproducible on every device, the basis for override prompts.        | §4, §5          | High  | M    | Med     |
| 15  | A rule seam with named per-exercise rules and engine-driven simulation tests that replay 20 Sessions per rule.                                  | §5, B1–B5 class | High  | M    | Med     |

### Decisions for the owner

These change behaviour users will notice; each has a recommendation in §6d.

- **D1** Effort: relative to the target, or the current absolute 9.5 / 7 thresholds?
- **D2** Stall: performance-based, or "the suggestion was not met N times" (needs snapshots)?
- **D3** Deload rounding: always down onto the grid, or nearest within a tolerance?
- **D4** "Insert deload now": shift the plan by a week, or restart the pattern?
- **D5** Phases on the calendar: keep, add "pause the Run", or move phases to Cycles?
- **D6** Test week: what is a "heavy single", and does a Test result change anything?
- **D7** Defaults: fractional plates on or off; the machine and cable default step.
- **D8** Novice linear progression across Workouts: which baseline by default?
- **D9** Same-day adjustment: on, and how quiet?
- **D10** Learning from overrides: one-line prompts only, or silent adaptation?
- **D11** Store a per-Session prescription snapshot (synced, private to the account)?

---

## 1. Correctness and edge cases

### 1.1 How a suggestion is made today

For one Workout exercise, `suggestNext` (`progress/progression.ts:202`) takes the planned sets
(in a Session: the Session's own rows and their copied targets), the exercise's history and a
context:

1. **Eligibility.** Only `weight_reps`, `bodyweight_weighted_reps`, `reps_only` and
   `bodyweight_reps` progress (`:211`). Only `working`, `top` and `backoff` sets progress; the
   others show Previous.
2. **Baseline.** The newest Session that is not in a Lighter week and not a Test or Deload, from
   the same Workout when the Previous preference says so, and for machines, cables and Smith
   from the same gym when there is one (`gym-history.ts`, `history-for-workout.ts`).
3. **Resets.** A break (14 days: 90%, 28 days: 80%), a Lighter week or the stalled-lift deload
   (90%) and a phase load share take the strictest factor and reset reps to the bottom of the
   range (`:228–290`). A phase rounds down onto the grid; the others round to the nearest load.
4. **Double progression.** Each set is matched to last time's set of the same kind and place.
   Reps climb to the top of the range, then load rises and reps go to the bottom. Straight
   working sets wait until every working set reached the top (`:305–316`) unless "per set" is
   on; top and back-off sets move alone. Logged RPE 9.5 or more holds; RPE 7 or less on every
   set at a load doubles the step (`:91–92, 317–323, 337, 356–361`). Two Sessions that missed
   the bottom of the range at a grind hold (`:293–294`).
5. **Grid and cap.** The step is about 2.5% of the load in whole steps of the gym's grid, the
   bar's smallest plate pair or the equipment default; a manual increment wins over all but a
   gym's own step (`progression-steps.ts:104–118`). At a cap, reps climb to 1.5 × the top of
   the range, then a hint (`:340–353`).

Stalls (`stalled-lift.ts`) are separate: the best Brzycki e1RM of the last three baseline
Sessions of the same Workout must beat the Session before them by 1%. Phases (`phases.ts`)
rewrite planned sets when a Session starts or the preview is read. Ghost values take the
suggestion first, then Previous, then the plan (`logging/ghost-for.ts`).

### 1.2 Bugs

Each finding: where, a concrete failing case (input → actual → expected), and a fix sketch.

#### B1 · High · Effort is judged on an absolute scale: grinds hold forever, a prescribed RPE 7 doubles the jump

_probe, code._ `progress/progression.ts:91–92, 314, 321, 337, 356–359`.

- 3 × 8–12 at 60 kg, logged 12/12/12 at RPE 8/9/10 (last set to failure, the usual way to run
  a rep range) → `hold_effort`, 60 × 12, and again every time the lifter logs the same honest
  RPE 10. Without RPE the same Session gives 62.5 × 8. Logging effort makes progress stop.
- A set planned at RPE 9.5–10 (failure work), logged 10 reps at RPE 10 four Sessions running
  → `hold_effort` four times. Expected: the target was met; add load.
- Push week (+1 RPE) as asked, 8 reps at RPE 9.5 → the next Build week holds. The phase the
  user followed blocks the next week.
- 2 × 5 planned at RPE 7 (a volume or technique day), logged at RPE 7 → +5 kg instead of
  +2.5 kg, every Session. Hitting the prescription is read as "easy".
- 9 of 8–12 at RPE 10 → `hold_effort` holds reps at 9 instead of asking for 10, and the copy
  says "You topped the range" (`en.json:1523`).
- The test `holds load and reps once more after topping the range at a grind`
  (`progression.test.ts:304`) and the copy ("once more") promise one hold; the code holds
  without limit.

Expected: a grind is a set clearly harder than its target (logged ≥ `effort_max` + 1, or
≥ 9.5 when the plan has no effort target); an easy set is clearly easier (≤ `effort_min` − 2,
or ≤ 7 without one). A grind holds load once; the next Session at the same load and reps
progresses with a single step. Below the top of the range a grind still asks for one more rep.
Boostcamp documents the relative rule: a logged RPE above the prescribed one holds the weight
([Boostcamp](https://www.boostcamp.app/features/auto-progression)). Decision D1.

#### B2 · High · The stall detector fires during the engine's own double progression

_probe._ `progress/stalled-lift.ts:11, 48, 121–123`; shown by `session/store/derive.ts:119–131`
and counted by Home's deload offer (`training/home/training-nudges.tsx:87`).

Following every suggestion exactly for 3 × 8–12 from 60 × 8:

```
60×12 (e1RM 86.4) → 62.5×8 (77.6) → 62.5×9 (80.4) → 62.5×10 (83.3)  stall = 3
65×8 (80.7) → 65×9 (83.6) → 65×10 (86.7)                            stall = 3
```

Expected 0: load rose, then reps rose every Session. Brzycki rates 12 reps at 60 kg above 8
reps at 62.5 kg, so every load jump in a wide range looks like a 10% loss. The Session shows
"Stalled for 3 sessions. Try 90% today." once per load cycle, and several accessories in the
same week trip "Several lifts have stalled" on Home. With a narrow range (6–8) the dip after a
jump is small enough not to trigger (worked by hand, not probed).

Fix: a Session improves on the reference when it moved more load for at least the bottom of
the range, or more reps at the same load, or 1% more e1RM. A stall is three Sessions without
any of those. With prescription snapshots (I5) a stricter test is possible: "the suggestion
was not met three times running". Decision D2.

#### B3 · High · "Try 90% today" compounds, and the note returns every Session

_probe, code._ `apps/native/src/exercise/stall/stall-state.ts:3–7` (memory belongs to the latest
Session), `session/store/derive.ts:127–147`, reset path `progression.ts:260–290`.

Stalled at 3 × 5 at 100 kg, apply 90% → 90 × 5. The 90 kg Session is an ordinary baseline,
so the next Session's stall count is 4 and, keyed to a new latest Session, the note shows
again. Applying again → 80 kg (81 rounded). Not applying: 92.5 kg, stall count 5, then 6 at
95 kg; the note reappears on each of them until the old best is beaten by 1%.

Expected: one deload per stall episode. The 90% Session should be recorded on the Session
(synced, so every device and the notification agree), left out of stall scoring like a
Lighter week Session, and the note kept quiet until the lifter has passed the pre-stall best or
a few Sessions have gone by.

#### B4 · Medium · The live notification ignores the applied stall deload

_code._ `session/notifications/workout-live-logging.ts:38–51` builds the suggestion settings
without `deload`; the Session screen passes `deload: stall?.applied === true`
(`session/store/derive.ts:145`).

Apply "90% today" on screen (100 → 90 kg), lock the phone, tap Done in the Android
notification → the set is ticked at the notification's ghost, the non-deloaded 100 or 102.5 kg.
Expected: the same ghost as the screen. The cause is structural (each surface builds its own
context, §5.2); the fix belongs in the shared builder or the prescription snapshot.

#### B5 · Medium · Adding a set reverts every other set's suggestion

_probe, code._ `progression.ts:305–316` (`workingReady` reads `lastWorking[ordinal]`), the
Session's rows become the plan (`session/logging/logging-ghosts.ts:76`), "Add set" copies the
last target (`session/logging/use-logging-state.ts:739`).

3 × 8–12, last 60 × 12 three times → ghosts 62.5 × 8. Tap Add set → all four ghosts become
60 × 12, reason `hold`. The same happens on the first Session after the user adds a set to the
Workout, with the copy "Hold: below the range twice". Removing a set has no such effect.

Expected: a slot with no counterpart at its place last time takes the nearest set's suggestion
but does not block the others.

#### B6 · Medium · The default kg gym kit makes barbell jumps 1 kg grained and warm-ups odd

_probe._ `plates/gym-kit.ts:7` seeds 0.5 kg plates, enabled; the bar grid's step is the
smallest pair (`progress/load-grid.ts:207`); the automatic increment is 2.5% in whole steps
(`progress/progression-steps.ts:111–122`).

With the seeded "gym" kit: 20 → 21, 40 → 41, 60 → 62, 100 → 103, 140 → 144, 220 → 226 kg.
The warm-up ramp to 140 kg is 20 × 10, 70 × 5, 98 × 3, 119 × 1. The home kit (smallest
1.25 kg) gives 2.5 kg steps; the lb kits give 5 and 10 lb. Many gyms have no 0.5 kg plates, and
lifters expect 2.5 or 5 kg jumps and round warm-ups.

Fix: seed fractional plates disabled (new kits only), and size automatic barbell steps with a
floor of 2.5 kg / 5 lb unless the gym set its own Load step; fractional plates stay available
for snapping and manual micro-loading. Warm-ups round to the nearest 2.5 kg (5 lb) first, then
to the kit. Decision D7.

#### B7 · Medium · The manual increment ignores the per-exercise unit

_probe, code._ The global `weightIncrementKg` is stored in kilograms from the account unit and
applied raw (`progression-steps.ts:112`, `derive.ts:141`, keypad step
`use-logging-state.ts:256`).

Account in kg with a 2.5 kg increment; an exercise set to lb at 100 lb → 105.5 lb (+5.5 lb).
Account in lb with 5 lb; an exercise set to kg at 60 kg → 62.25 kg. Gridded equipment snaps it
away; machines, cables, Smith, EZ and trap bars do not. Expected 105 lb and 62.5 kg. The
per-exercise unit merged at HEAD, so this is fresh.

Fix: store the increment with its unit and convert to the nominal step of the exercise's unit
(2.5 kg ↔ 5 lb), or fall back to the equipment default when the units differ.

#### B8 · Medium · The top of the kit is not a cap: the lifter holds forever

_probe._ `progress/load-grid.ts:194–195` (a bar grid has no cap), `progression.ts:362–363`
(no higher load → `hold`).

Home kit: 20 kg bar, two pairs of 20 kg, one pair of 5 and one of 2.5 (most 115 kg). Last
115 × 12 on 8–12 → `hold`, 115 × 12, every Session, labelled "Hold: below the range twice".
Expected the cap behaviour the spec gives machines: 115 × 13 … 18, then "add a set or go
single-arm", with copy that names the plates.

Fix: a grid reports its highest load; `addLoad` returning null at the top is treated as
`atCap`.

#### B9 · Medium · Repeated misses never reduce the load

_probe._ `progression.ts:293–294, 336`.

3 × 8–12 at 60 kg, 6 reps (at a grind, or with no effort logged) in four Sessions → `hold`,
60 × 6, four times. The only
way out is the stall note three or more Sessions later (and then B3). Expected after two misses:
a load estimated to make the bottom of the range, rounded down to the grid (e1RM of the miss
at `reps_min`), labelled as a reset. Boostcamp documents this: it "estimates a weight you can
lift for the target reps, rounded down to your step size"
([Boostcamp](https://www.boostcamp.app/features/auto-progression)).

#### B10 · Medium · The exercise page's "Next time" uses the wrong plan and context

_code._ `packages/sync/src/training/watch.ts:1198–1199` picks the most recently created
Workout that contains the exercise; `apps/native/src/exercise/detail/use-exercise-progression.ts:66–73`
reads every Session of the exercise, with no same-Workout baseline, no phase and no stall deload.

Bench 3 × 5 at 100 kg in the Program; later a standalone Workout with bench 2 × 10–12 is
created and never trained → "Next time 100 kg × 10–12 · One more rep": a 5-rep Session read
against a 10–12 plan. In a Deload week the page shows the Build suggestion. Expected: the
Workout the lifter will train next (the active Run's next Slot that holds it, else the last one
trained), the same context as the Session, and the Workout named on the line.

#### B11 · Medium · Several reasons say something false

_code._ `progression.ts:336, 348, 363, 373`; `packages/i18n/src/locales/en.json:1514–1527`.

- `hold` has three causes: two misses, straight sets waiting for each other (B5), and no higher
  load (B8). Its copy covers only the first: "Hold: below the range twice".
- `hold_effort` fires below the top of the range; the copy says "You topped the range".
- `deload` always says "90% of last time", but a Program can set the Deload load share from 50%
  to 100%, and snapping gives 80% on a 12.5 kg dumbbell (B13).
- `add_weight` says "A set reached the top… Sets that did not top the range add a rep", which
  describes per-set mode; straight sets add only when every set topped.
- The in-Session chip shows the single highest-priority reason even when sets differ (top set
  `add_weight`, back-offs `add_rep`).

Fix: split `hold` into `hold_missed`, `hold_together` ("Waiting for every set to reach 12")
and the cap reasons; carry the applied factor in the result; make the copy per outcome.

#### B12 · Medium · Machines and cables without a Load step add 1 kg or 2.5 lb

_probe._ `progress/progression-steps.ts:27–28`.

Machine 50 × 12 → 51 × 8; 20 → 21; a lb cable at 50 lb → 52.5 lb. Most pin stacks step 5 kg or
10 lb (cables often 2.5 kg). The suggestion is a pin that does not exist until the user sets a
Load step per gym. The spec chose "fine adjustment"; the cap prompt shows the pattern for asking
once. Decision D7.

#### B13 · Low–Medium · Deload snapping cuts far more than the banner says

_probe._ `phases/phases.ts:279`, `progression-steps.ts:182`.

Deload at 90%, snapped down: dumbbells 12.5 → 10 (−20%), 15 → 12.5 (−17%), 30 → 25 (−17%);
a 5 kg stack 15 → 10 (−33%), 25 → 20 (−20%), 70 → 60 (−14%). The banner says "−10% load". A
break, by contrast, rounds to the nearest (30 → 27.5). Fix: round down only while the cut stays
within about 5 points of the share, else take the nearest; show the real cut. Decision D3.

#### B14 · Low–Medium · "Insert deload now", then the planned deload two weeks later

_probe._ `phases/phases.ts:177–185, 234–237`.

Pattern Build, Build, Build, Deload; insert in week 3 → weeks 1–9 read
B B **D** B **D** B B B D. Two deloads in three weeks. Expected (likely): an inserted deload
restarts the pattern, so three Builds follow it. Decision D4.

#### B15 · Low–Medium · The Test week does not test, and its result goes nowhere

_probe, code._ `phases/phases.ts:312–337`, `packages/sync/src/training/sessions/phase-inputs.ts:99–122`,
`packages/sync/src/training/sessions/session-store.ts:259–262`,
`training/workouts/workout-preview-screen.tsx:154`.

- 5 × 5 at 100 kg → the Test single is 100 × 1, an RPE 6 single for someone whose e1RM is
  about 112 kg. For a Workout that already has a `top` set the single's ghost is last top
  set plus a step (140 × 3 → 142.5 × 1): two meanings of "heavy single".
- After a three-week break, a Run week that lands on Test still seeds the pre-break load: the
  break factor never touches `testLoadKg`.
- Test Sessions are excluded from every baseline. The single sets a Record and nothing else; the
  next block does not start from it.

Fix: seed the single near e1RM × 0.9–0.95 (an RPE 8–9 single), apply the break factor, offer
two lighter singles to work up, and let a Test result update the lift's e1RM (I7). Decision D6.

#### B16 · Low–Medium · Drop, failure and myo sets ignore break, deload and phase factors

_code._ `session/store/derive.ts:158–173` (non-progressing kinds take Previous as their ghost),
`logging/ghost-for.ts:18–41`.

Back after five weeks: working sets suggest 80 kg (from 100), the drop set's ghost stays at
last time's 75 kg, a 6% drop instead of 25%. In a Deload that keeps "1 working + 1 myo", the myo
set shows its full load. Fix: scale non-progressing ghosts by the same factor as the Session's
working sets, or by the ratio of today's working load to last time's.

#### B17 · Low–Medium · Back-off sets drift apart

_probe._ `progression.ts:355` (non-working kinds progress set by set).

Top 140 × 3, back-offs 120 × 4 and 120 × 5 → 120 × 5 and 122.5 × 5. Back-offs are normally
straight sets, and often a share of today's top set. Fix: back-offs move together like working
sets; a later rule can express them as a percentage of the top (I6).

#### B18 · Low · Two entries of one exercise merge in history

_probe, code._ History is keyed by exercise (`session-watch.ts:485–494`); counterparts are
matched by kind and place (`progression.ts:127–134`).

Bench 3 × 5 at 100 kg then bench 2 × 10–12 at 70 kg in one Session → next time the second
entry suggests 100 × 6. The pickers block duplicates (`session-screen.tsx:325`), so this comes
from imported Strong or Hevy files and two-device Workout edits. Fix: match by the Session
exercise row (source Workout exercise) when an exercise appears twice.

#### B19 · Low · Planned muscle targets ignore the phase

_code, probe._ `volume/weekly-muscle-volume.ts:79–104`, `training/muscles/use-muscle-volume.ts:81`.

In a Deload week, a Program-derived chest target of 8 sets shows "below" at the 4 sets the plan
itself asked for. Fix: apply the week's set factor to the planned volume, or say "Deload week".

#### B20 · Low · Phases run on the calendar while the Rotation does not

_code, probe._ `plans/cycle.ts:87–101`, `phases.ts:206–227`.

A missed week can land the lifter in Test or skip a Deload. Travel moves the boundary: the same
instant is Run week 3 in Los Angeles and week 4 in Kolkata. DST is handled correctly. Decision
D5.

#### B21 · Low (decision) · Novice linear progression runs at half speed across two Workouts

_probe._ Default Previous source `same_workout` (`history-for-workout.ts`, `derive.ts:110–113`).

Squat 3 × 5 in Workouts A and B, alternating, following every suggestion: A 60, B 62.5,
A 62.5, B 65, A 65 … reaching 70 kg after eight Sessions; with "Any session" 77.5 kg. The
setting is the workaround; novices will not find it. Decision D8.

#### B22 · Low · Unloadable steps for weighted bodyweight and kettlebells

_probe._ `progression-steps.ts:25, 31`. Dips at +20 kg → +21; pull-ups at +0 → +1 kg; a 16 kg
kettlebell → 18 kg (most sets go 16, 20, 24). Fix: belt loads step by 1.25 kg pairs or plates;
kettlebells by 4 kg unless the gym lists its bells.

#### B23 · Low · A maintained lift is stalled forever

_probe._ 500 Sessions at 100 × 5 → "Stalled for 499 sessions". Dismissing lasts until the next
Session. There is no way to say "maintain this lift". Fix: a Maintain rule (I6) that neither
progresses nor reports stalls.

#### B24 · Low · Break handling: bodyweight reps ignore it, every long break is 80%

_probe._ `progression.ts:236–248`. Push-ups after 90 days off → 13 reps (+1). A barbell lift
after 400 days → 80% (140 → 112.5 kg), the same as after 28 days. Fix: bodyweight reps return
to the bottom of the range after a break; beyond about 12 weeks offer 70%, and say so.

#### B25 · Low · Long histories cost more than they need to

_probe._ `logging/previous-for.ts:15` re-sorts and re-parses dates on every call; stall gaps are
quadratic. Over 500 Sessions, 40 Previous lookups take 6 ms and one stall pass 7 ms in Node;
Hermes is several times slower, and both run on every tick of that exercise. The history
arrives already sorted; parse once and memoise per history.

#### B26 · Low · CONTEXT.md and the code disagree on the Session goal

CONTEXT.md says the Program's Slots come before the preference; `plans/session-goal.ts:22` and
its tests put the preference first. Fix the glossary or the code.

### 1.3 Edge-case sweep

What else was checked, and what holds up.

| Area                                     | Result                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| kg and lb round trips                    | Sound. Logged lb weights keep gram identity; lb kits step 135 → 140, 225 → 230, 315 → 325 lb. Unit override with a manual increment fails (B7).                                                                                                                              |
| Double and per-set progression           | Sound as single steps; sequences fail through B1, B2 and B5.                                                                                                                                                                                                                 |
| Set kinds                                | Warm-ups are excluded from every number. Top and back-off progress alone (B17). Drop, failure and myo never progress and ignore load factors (B16). A phase sets factor above 1 repeats the last set, drop or failure included.                                              |
| RPE and RIR                              | One stored scale (RPE 6–10 in halves), RIR is display only; phase shifts clamp to the scale. Ticking never fills effort from a ghost, so the effort ghost is a hint only. Thresholds are absolute (B1).                                                                      |
| Grinds and misses                        | B1, B9.                                                                                                                                                                                                                                                                      |
| Break returns                            | 14 and 28 day thresholds from the last trained Session across Workouts and gyms; Deload and Lighter Sessions count as training. B24.                                                                                                                                         |
| Stalls                                   | 14-day gap rule and Deload or Test Sessions filling gaps work. B2, B3, B23.                                                                                                                                                                                                  |
| Lighter week (legacy)                    | Its Sessions are never a baseline and count for the break clock; a tie with a phase names `deload`. Previous-based hints still read Lighter Sessions (minor).                                                                                                                |
| Phases                                   | Snapshot on the Session, last-write-wins plan, union of inserted deloads across devices: sound. B13, B14, B15, B19, B20.                                                                                                                                                     |
| Caps and load ranges                     | `capped`, `cap_reps`, `cap_hint`, lb rounding under a kg cap, multi-range snapping, a cap below the last load: sound. Off-grid 87.5 kg on a 5 kg stack goes to the 90 kg cap.                                                                                                |
| Dumbbell max                             | Per hand, lower of exercise cap and gym max wins, works in lb. Sound.                                                                                                                                                                                                        |
| Kit, bar and plate counts                | The subset-sum solver handles counts, units and caps. The top of the kit is not a cap (B8).                                                                                                                                                                                  |
| Gyms                                     | Session and notification use the Session gym; preview and exercise page the active gym (as designed). Phase targets are snapped to the gym at start and not re-snapped if the Session gym changes. Machine history from a gym with only Deload Sessions gives no suggestion. |
| Assisted, bodyweight, duration, distance | Assisted, duration and distance types get no suggestion (`progression.ts:211`); assisted Records need a bodyweight. Bodyweight reps climb past the range for ever.                                                                                                           |
| Weighted bodyweight                      | Progresses the added load; steps unloadable (B22). e1RM uses bodyweight + load, or the load alone while no bodyweight is known, so the first weigh-in can look like a jump.                                                                                                  |
| Supersets                                | Engine-agnostic; nothing found.                                                                                                                                                                                                                                              |
| Cycles and skips                         | Legacy Sessions, repeated Workouts, skips, out-of-order training and two offline devices in different Cycles behave as documented (`plans/cycle.ts`).                                                                                                                        |
| Midnight, time zones, DST                | Weeks and breaks use the start instant and calendar days; DST is safe; travel can shift a Run week by a day (B20).                                                                                                                                                           |
| Two offline devices                      | Phase plan last write wins (documented), inserted deloads merge, stall memory is per device (B3, B4).                                                                                                                                                                        |
| Long, empty and imported histories       | 500 Sessions per exercise are read (`session-watch.ts:24`); cost B25. Empty history: no suggestion, ghosts from the plan. Imports have no Workout, gym or phase, so they act as any-Workout baselines; duplicate entries B18; imported RPE feeds B1.                         |

### 1.4 Test gaps

The suite checks single steps thoroughly and sequences hardly at all. Missing:

- **Engine-driven sequences**: follow the suggestion for 20 Sessions per rule and assert no
  stall, no hold loop, loads on the grid and under the cap (would have caught B1, B2, B9).
- **Structure changes**: add or remove a set, add a set to the Workout (B5).
- **Seeded defaults**: increments with `defaultGymKit("kg", "gym")` (B6), machine defaults (B12).
- **Cross-surface parity**: one input set through the Session, notification, preview and
  exercise page builders must give the same ghosts (B4, B10).
- **Stall lifecycle**: apply, then the next three Sessions (B3).
- **Unit override × manual increment** (B7), **kit maximum** (B8), **Test seed** (B15),
  **non-progressing kinds under a factor** (B16).

---

## 2. What lifters need, and what Sigil has

Status: **Has**, **Partial** (works for some cases or with caveats) or **Missing**.

| Need                                  | Status          | Where in Sigil                                                                                 | Gap                                                                                                                                                             |
| ------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linear progression (novices)          | Partial         | Fixed rep target (`reps_min = reps_max`) adds load when every set makes it (`progression.ts`). | Half speed across two Workouts by default (B21); repeated failure never resets (B9); 1 kg jumps with the seeded kit (B6); no "reset 10% after 3 misses" policy. |
| Double progression                    | Has             | Straight sets wait for each other; per-set option; caps extend the rep ceiling.                | B1, B2, B5; no more-reps-before-a-big-jump (I4).                                                                                                                |
| RPE / RIR autoregulation              | Partial         | Effort logging, effort targets, Push +1 RPE, grind holds, easy doubles.                        | Thresholds absolute (B1); a target never chooses a load; no same-day adjustment; e1RM ignores RPE.                                                              |
| %1RM and e1RM programming             | Missing         | Brzycki e1RM for 1–12 reps feeds Records and stalls only (`volume/volume.ts:69`).              | No percentage targets, no training max; a planned weight is only a seed for the first ghost.                                                                    |
| Top set and back-offs                 | Partial         | `top` and `backoff` kinds progress against their own counterparts.                             | Back-offs are not tied to the top set and drift apart (B17); the top set is not chosen by RPE.                                                                  |
| AMRAP-based progression (5/3/1 style) | Missing         | `failure` kind; Test week AMRAP.                                                               | No AMRAP-driven training max; failure sets never progress.                                                                                                      |
| Wave and step loading                 | Partial         | Phases with editable sets, RPE and load share; four pattern presets.                           | Load can only go down in a phase; no weekly load steps or waves (e.g. 85/90/95%).                                                                               |
| Peaking and tapering                  | Partial         | Test week (single or AMRAP), Deload.                                                           | No taper (volume down, intensity kept), no multi-week peak; Test seeding (B15).                                                                                 |
| Meet attempts                         | Missing         | —                                                                                              | No attempt selection from e1RM and the day's top set.                                                                                                           |
| Rep-max tracking                      | Has             | Records: heaviest, e1RM, 1–12 rep maxes, volumes, durations, pace (`progress/records.ts`).     | e1RM ignores RPE and anything over 12 reps.                                                                                                                     |
| Plateau handling                      | Partial (buggy) | Stalled note with 90% today; Home offers a Deload week after three stalls.                     | B2, B3, B23.                                                                                                                                                    |
| Deload strategies                     | Has             | Phase Deload preset and edits, Insert deload now, legacy Lighter week.                         | B13, B14, B16.                                                                                                                                                  |
| Fatigue and readiness                 | Missing         | Breaks only.                                                                                   | No readiness check, no Session RPE, no recovery signal.                                                                                                         |
| Volume landmarks per muscle           | Partial         | Muscle goals (Maintain 6–10, Grow 10–20, Focus 16–24, Custom), weekly and planned volume.      | Not phase-aware (B19); every Counted set is one set whatever its effort or kind; no volume progression across a block.                                          |
| Frequency                             | Partial         | Sessions-per-week goal; Rotation.                                                              | The engine has no per-muscle frequency signal (UI not checked).                                                                                                 |
| Warm-up generation                    | Has             | Editable ramp, kit and grid rounding, caps, auto per exercise (`logging/warmup-ramp.ts`).      | `weight_reps` only; odd numbers with fractional plates (B6).                                                                                                    |
| Plate math                            | Has             | Subset-sum solver with plate counts, bar choice, unit kits, caps (`plates/plates.ts`).         | —                                                                                                                                                               |
| Unilateral and per-side loads         | Partial         | `loadBasisOf`: per hand for dumbbells and bells (`load-grid.ts:66`).                           | No unilateral flag; volume of a two-dumbbell lift counts one dumbbell; `per_side` unused.                                                                       |
| Machines with stacks and caps         | Has             | Gym ranges, caps with rep extension, "Is this the max?" prompt (`gym/cap-prompt.ts`).          | 1 kg default step (B12); micro-adds and per-machine profiles deferred.                                                                                          |
| Bands and chains                      | Missing         | `resistance_band` is only an equipment step.                                                   | No band tension or accommodating resistance.                                                                                                                    |
| Tempo, pauses, ROM variants           | Missing         | Notes only ("Partials and negatives are notes").                                               | No structured tempo or pause, so the engine cannot tell a paused bench from a touch-and-go one.                                                                 |
| Substitution with load transfer       | Missing         | Swap ranking by availability and muscle detail.                                                | No load seed for a first-time swap (deferred in the spec).                                                                                                      |
| Assisted, timed and distance work     | Missing         | —                                                                                              | Assistance should step down; planks, carries and cardio do not progress.                                                                                        |
| Home gym                              | Partial         | Home kit seed, plate counts, dumbbell max, Equipment here.                                     | The top of the kit holds forever (B8).                                                                                                                          |
| Older and returning                   | Partial         | 90% after 14 days, 80% after 28.                                                               | Flat 80% for any long break; bodyweight unaffected (B24).                                                                                                       |
| Injured                               | Partial         | A gym Max load caps a lift; swaps; notes.                                                      | No pain flag, no Maintain rule, no ROM progression.                                                                                                             |
| Time-limited                          | Missing         | —                                                                                              | No short-Session variant (roadmap item 2).                                                                                                                      |

**By lifter.**

- **Beginner.** Linear and double progression exist, but the defaults work against them: 1 kg
  jumps, half-speed progression on A/B splits, holds after failures with no reset. Fix B6, B9,
  B21 first; these are the people least likely to change settings.
- **Average gym-goer.** Double progression with machines and dumbbells. Hurt by B2 (false stall
  notes), B12 (non-existent pins) and the missing reps-before-jump on coarse dumbbell steps.
- **Bodybuilder.** Trains near failure and logs it, so B1 blocks progress. Wants volume per
  muscle (Sigil has it), drop and myo sets (B16), and same-day adjustment.
- **Powerlifter.** Needs top sets by RPE, back-offs as a share of the top, e1RM and percentage
  work, peaking and attempts. Sigil has the kinds and phases but none of the arithmetic, and the
  Test week seeds a light single (B15).
- **Home-gym lifter.** Well served by kit modelling, except the kit maximum (B8).
- **Returning or older lifter.** Breaks are handled once; a longer break deserves a lower start
  and a steadier climb.
- **Injured or time-limited lifter.** Mostly unserved: no Maintain rule, no short Session.

---

## 3. Competitive bar

### 3.1 Engine behaviour compared

Claims are from each vendor's own pages unless marked. "—" means nothing was documented in the
sources read, not that the feature is absent.

| App                   | Baseline                                                   | Progression model                                                                   | Effort                                                          | Same-day adaptation                      | Equipment realism                                                 | Deload and plateau                                            | %1RM / e1RM                         |
| --------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| **Sigil today**       | Same Workout (preference), same gym for machines           | Double; per-set option; top and back-off alone; caps extend reps                    | Absolute: ≥ 9.5 holds, ≤ 7 doubles                              | None                                     | Gym ranges, kit-derived bar grid, dumbbell max, caps              | Breaks 90/80%; stall note; phases; insert deload              | e1RM for Records and stalls         |
| Hevy [1][2]           | Same routine or any workout (Previous column)              | Trainer (Pro): weight rises when the top of the range is hit on all prescribed sets | RPE tracking optional                                           | —                                        | Plate calculator                                                  | —                                                             | —                                   |
| Lyfta [3]             | Any or same workout                                        | "AI exercise suggestions" toggle; no documented load rule                           | RPE or RIR tracking                                             | —                                        | Per-exercise unit; plate calculator (Premium)                     | —                                                             | —                                   |
| Strong [4]            | Previous values                                            | None documented                                                                     | —                                                               | —                                        | —                                                                 | —                                                             | 1RM charts                          |
| Alpha Progression [5] | Reference workout: same plan day (default) or last workout | Double progression; builds reps first before a big jump; may recommend less         | RIR optional; aims at a RIR target when set                     | Yes: today's sets change the next set    | Available weights are "a firm constraint"; ranges per machine [6] | Workouts marked deload are adjusted                           | Internal estimated 10RM             |
| Fitbod [7]            | All history                                                | Weights from an estimated 1RM; eases after a struggle (help-centre snippets)        | —                                                               | Claimed                                  | Gym profiles with equipment and increments                        | Muscle recovery 0–100%; flags plateaus (blog)                 | e1RM drives the weight              |
| Liftosaur [8]         | Program state                                              | `lp`, `dp`, `sum`, `custom` scripts; `lp` decreases after N failures                | RPE tables turn reps at RPE into %1RM                           | `update:` scripts run during the workout | Increments step to valid equipment weights (reported)             | Written into the program (deload weeks)                       | Percent of `rm1`; RPE tables        |
| JuggernautAI [9]      | Its own model                                              | Individualised blocks (hypertrophy, strength, peaking)                              | Top-set and back-off RPE change the following sets in real time | Yes                                      | —                                                                 | Readiness questions modify volume or weight; weekly check-ins | e1RM tracked (reviews)              |
| RP Hypertrophy [10]   | Its own model                                              | Mesocycles; sets adjusted from pump, soreness, joint pain and workload feedback     | RIR falls across the mesocycle (user report, 3 → 0)             | —                                        | —                                                                 | Deload after each mesocycle; volume landmarks                 | —                                   |
| Boostcamp [11]        | Last Session                                               | Pro: linear for fixed reps, double for ranges; step "twice your smallest plate"     | Logged RPE above the prescription holds                         | —                                        | Step adjustable per exercise                                      | A miss estimates a load for the target reps, rounded down     | Percentage sets left to the program |

Explanations: Alpha shows a recommendation bubble under each set with no written rationale [5];
Liftosaur scripts can print to the workout or a playground [8]; Sigil shows a reason label and a
paragraph. None of the sources read show evidence (which Session, which sets) next to a
suggestion.

### 3.2 Where Sigil already leads

- **Loads that exist.** Gym ranges, a bar grid built from the gym's own plates and counts, a
  dumbbell max, caps with a rep ceiling and a cap prompt. Only Alpha and MacroFactor model this
  much; Hevy, Strong, Lyfta and Boostcamp do not prescribe against kit.
- **Phases without rewriting the plan.** Week phases with editable modifiers, inserted deloads
  that merge across devices, and a per-Session snapshot. No logging-first app documents this.
- **Clean baselines.** Test, Deload and Lighter Sessions never feed progression; breaks and the
  gym are taken into account.
- **On the device, free.** Hevy's warm-up calculator is Pro and Lyfta's warm-ups are Premium
  ([gap list](../research/hevy-lyfta-feature-gap.md)); Boostcamp's Auto Progression is Pro [11].
  Sigil computes all of it locally and offline.

### 3.3 Where it trails

- **Effort as a rule, not a ratio** (B1). Boostcamp compares RPE with the prescription; Alpha
  aims at a RIR target; Juggernaut adjusts the next sets from the top set's RPE.
- **Nothing happens within a Session.** Alpha and Juggernaut react to today's sets.
- **Coarse steps.** Alpha builds reps before a big jump; Sigil jumps 20% on light dumbbells.
- **No percentage or e1RM work.** Liftosaur, Juggernaut and Boostcamp programs express it.
- **No reset rule on failure** (B9); Boostcamp and Liftosaur have one.
- **No readiness or recovery** input (Juggernaut, RP, Fitbod).

### 3.4 How Sigil can be clearly better, its own way

Sigil's take is quiet, honest, explainable and local-first. That points away from a coach
persona or a recovery score, and towards an engine the lifter can read like a ledger.

1. **Show the arithmetic.** Every suggestion carries its evidence: "Tue 18 Nov, Push A: 3 × 12
   at 60 kg. Every set reached 12. Add 2.5 kg, back to 8." A break says "Last trained 23 days
   ago: 90%." A snapped Deload says "−17%: the next dumbbell down is 25 kg." No other app
   reviewed does this (§3.1); it costs little because the engine already knows each fact (I2).
2. **Rules you can name.** Each exercise shows its rule in plain words: "Double progression ·
   8–12 · +2.5 kg", "Linear · 5 × 5 · reset 10% after two misses", "Top set at RPE 8, back-offs
   at 90%", "Maintain". One sheet to change it, and a four-Session preview of what the rule will
   do if every rep is made: Liftosaur's playground without the script (I6).
3. **Gym truth, learned politely.** Only loads that exist where the lifter stands. When they
   type over a suggestion the same way twice, ask one quiet question: "Is 5 kg the step on this
   machine?", "Use 5 kg steps for Deadlift?", "Raise this range to 10–15?". The cap prompt
   already works this way; extend the pattern (I5). No silent drift.
4. **A ledger, not a score.** Store what was suggested next to what was done (I5). Stalls become
   "the suggestion was not met three times", which is honest and explainable; a Run review can
   say which lifts moved and which held, without streaks or badges.
5. **Phases that keep their word.** A Deload states its real cut; a Test week tests and its
   result becomes the next block's starting point; muscle targets know it is a Deload week.
6. **The same answer everywhere.** One `prescribe()` gives the Session, the notification, the
   preview and the exercise page the same numbers, on every device, offline. The snapshot makes
   a Session's targets reproducible in "Your record" exports.
7. **Respect the lifter's word.** Overrides are data, never errors. The engine follows what was
   actually lifted (it already does), and a rule changes only when the lifter says yes.

Sources:

1. Hevy, [Previous workout values](https://help.hevyapp.com/hc/en-us/articles/36011896355479-How-to-Use-Previous-Workout-Values-to-Improve-Performance-in-Hevy);
   [Hevy Trainer](https://help.hevyapp.com/hc/en-us/articles/38385724273047-Hevy-Trainer-Explained-How-It-Builds-Your-Workout-Program)
   (the rep-range rule is quoted from a search summary of Hevy's help centre).
2. Hevy, [features](https://www.hevyapp.com/features/).
3. Lyfta: on-device inspection in [hevy-lyfta-feature-gap](../research/hevy-lyfta-feature-gap.md)
   (no Lyfta help centre exists; no progression rule was found on the web).
4. Strong: no prescription feature found;
   [merge exercises](https://help.strongapp.io/article/209-how-do-i-merge-data-between-two-exercises)
   is the only engine-adjacent help page.
5. Alpha Progression, [progression recommendations](https://alphaprogression.com/en/blog/alpha-progression-progression-recommendations)
   (read in full) and [guide](https://alphaprogression.com/en/blog/alpha-progression-guide).
6. Alpha Progression, [available weights](https://alphaprogression.com/en/glossary/available-weights).
7. Fitbod, [How Fitbod creates your workout](https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout)
   and [algorithm](https://fitbod.me/blog/fitbod-algorithm) (both refused our fetcher; claims
   from search snippets).
8. Liftosaur, [Liftoscript documentation](https://www.liftosaur.com/doc/liftoscript) (read in part).
9. JuggernautAI, [how it is individualised](https://help.jtsstrength.com/en/articles/3-how-juggernautai-is-individualized-to-you)
   and [RPE and RIR](https://help.jtsstrength.com/en/articles/2-all-about-rpe-and-rir).
10. RP Hypertrophy, [App Store listing](https://apps.apple.com/us/app/rp-hypertrophy/id1555614554);
    [user report on the help community](https://hypertrophy.zendesk.com/hc/en-us/community/posts/22316645578007-Maintenance-Phase-using-Hypertrophy-App)
    (anecdotal).
11. Boostcamp, [Auto Progression](https://www.boostcamp.app/features/auto-progression) (read in full).
12. Background: the RIR-based RPE scale, Zourdos et al. 2016,
    [J Strength Cond Res 30(1)](https://openrepository.aut.ac.nz/items/efef3b25-6701-4fb5-bb82-55fcd2a26027/full),
    and its [application](https://ro.ecu.edu.au/ecuworkspost2013/2114) (Helms et al. 2016);
    5/3/1's training max at 90% of 1RM, summarised at
    [Lift Vault](https://liftvault.com/resources/531-training-max-definition-examples/)
    (secondary source).

---

## 4. Usability of the engine's output

### Explainability

The pieces are there: a closed set of reasons with a short label and a paragraph
(`platform/ui/progression-reason.ts`, `session/sets/progression-chip.tsx`), a per-set last
versus today list in the Workout preview, and "Next time" on the exercise page. What is
missing:

- **Evidence.** No reason says which Session it compared with, when, or which sets made the
  decision. A lifter cannot check the engine's work.
- **Accuracy.** Four reasons say something false in common cases (B11).
- **Per set.** One reason stands for the whole exercise even when sets differ.
- **Factors.** Breaks, Deloads and snapping never say the actual percentage or the grid point
  they landed on.

### Predictability

- The same exercise gets different numbers on the Session screen, in the notification (B4) and
  on the exercise page (B10).
- Numbers move under the thumb: adding a set (B5), or another device's Session syncing in
  mid-Session (ghosts are recomputed from history; nothing is frozen at start).
- Phases follow the calendar, so a missed week shifts what the next Session asks (B20).
- The stall note appears in the middle of progress (B2) and returns after being acted on (B3).

### Overriding, and whether overrides teach

Overriding is easy: type over any ghost; ticking adopts ghosts only into empty cells. The next
suggestion reads what was actually lifted, so a heavier override becomes the new baseline,
which is the right default. But the engine never learns the lifter's rule: someone who always
adds 5 kg to deadlifts, always lowers a machine to the same pin, or always does 15 reps on an
8–12 range gets the same suggestion again. The one exception is the cap prompt (two Sessions
lowered to the same weight, `gym/cap-prompt.ts:171`). The engine also cannot tell an accepted
ghost from a typed value: nothing records what was suggested.

### Surprise factors, in the order a lifter would meet them

1. "Add 3 kg" on a 100 kg bench, then a 98 kg warm-up (B6).
2. A 51 kg pin on a machine (B12).
3. "Stalled" while every Session went up (B2).
4. The bench never goes up after logging honest RPE 10s (B1).
5. Tapping Add set and watching the other ghosts drop (B5).
6. "90% today" back again the next Session (B3), and the notification logging 100% (B4).
7. A Deload that cuts 20% while saying 10% (B13), two Deloads in three weeks (B14).
8. A "heavy single" at the 5-rep weight (B15).

### Trust

Sigil's voice is short and factual, which raises the stakes: a quiet app that states something
false loses more trust than a chatty one. The cheapest, highest-trust work in this review is
copy and evidence (B11, I2), followed by the fixes that stop the engine contradicting itself
(B1, B2, B3).

---

## 5. Extensibility and architecture

### 5.1 Shape today

The core is pure and runtime-neutral (`packages/shared`), which is the right foundation: every
finding above was reproducible in a plain test file. The cost is concentration:
`suggestNext` is one function of about 190 lines whose behaviour is a fixed rule plus switches
(`progressionPerSet`, `deload`, `phaseLoad`, `grid`), and whose output is a reason enum without
evidence.

**Where state lives.**

| Kind                      | What                                                                                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synced tables             | Workouts and planned sets; `program.phase_plan`; `program_run.inserted_deloads`; `workout.main_entry_id`; Session `phase`, `phase_modifiers`, `gym_id`; gyms, kit, gym exercise settings; `exercise_setting` (unit, per-set, auto warm-ups, bar, effort). |
| Synced preferences (`ui`) | Unit, manual increment, Previous source, Lighter weeks, deload card dismissal, active gym, cap prompts, muscle goals, warm-up settings, week start, effort scale.                                                                                         |
| Device only               | Stall memory (`device.stall.<exerciseId>`, `exercise/stall/stall-store.ts:7`).                                                                                                                                                                            |
| Derived on read           | Suggestions, ghosts, Previous, stalls, Records, muscle volume, Cycle state, the week's phase.                                                                                                                                                             |
| Nowhere                   | What the engine suggested, and whether a logged value was accepted or typed.                                                                                                                                                                              |

### 5.2 Duplicated logic

| Concern                  | Built in                                                                                                                                                                                                                         | Drift found                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Suggestion context       | Session (`session/store/derive.ts:135–147`), notification (`notifications/workout-live-logging.ts:38–51`), preview (`training/workouts/workout-preview-screen.tsx:176–200`), exercise page (`use-exercise-progression.ts:66–73`) | Notification lacks the deload (B4); exercise page lacks Workout, phase and deload (B10). |
| Phase applied to targets | Session start (`packages/sync/.../sessions/session-store.ts:236–265`), preview (`workout-preview-screen.tsx:139–157`)                                                                                                            | Two grid sources (transaction read versus hook) can differ briefly.                      |
| Test week load           | SQL `lastBaselineLoadKg` (`phase-inputs.ts:99–122`), shared `lastBaselineLoadKg` (`progression.ts:108`)                                                                                                                          | Same rule twice.                                                                         |
| History query            | `EXERCISE_HISTORY_SQL` (notification), `exerciseHistoriesSql` (Session), Previous hooks (preview, Home)                                                                                                                          | Same limits today; kept in step by hand.                                                 |
| Load grid                | `gymGridsOf` (progression, Session start), `warmupLoading` (`session/warmups/warmup-plan.ts:58–89`)                                                                                                                              | Warm-ups resolve ranges, kit and dumbbell grid on their own.                             |
| Stall verdict            | Session derive, Workout preview, Home (`stalledExerciseIds`)                                                                                                                                                                     | Each reads history and stall memory separately.                                          |

### 5.3 Proposed boundaries

One entry point, one context loader, and a rule seam. Sketch:

```ts
// packages/shared/src/training/engine/types.ts
export type ExerciseContext = {
  exercise: { id: string; type: ExerciseType; equipment: Equipment; unit: WeightUnit };
  /** The plan as the Session starts it: phase applied, Session rows mapped to plan slots. */
  plan: readonly PlannedSet[];
  rule: RuleConfig; // default { id: "double" }
  /** Newest first, with workoutId, gymId, phase, lighter flag and each set's target snapshot. */
  history: readonly ExerciseSession[];
  baseline: { workoutId: string | null; gymId: string | null; source: PreviousSource };
  grid: LoadGrid | null;
  increment: { value: number; unit: WeightUnit } | null;
  phase: { phase: Phase; modifiers: PhaseModifiers } | null;
  adjustments: { stallDeload: boolean; lighterWeek: boolean };
  now: Date;
};

export type Prescription = {
  rule: RuleId;
  sets: (SuggestedSet | null)[];
  reasons: (ReasonCode | null)[]; // per set
  evidence: Evidence; // baseline Session id and date, compared sets, factors, snapping notes
};

export interface ProgressionRule<Config> {
  id: RuleId;
  propose(
    slots: readonly Slot[],
    baseline: BaselineSession,
    ctx: ExerciseContext,
    config: Config,
  ): SlotProposal[];
}

/** Baseline → resets → rule → effort → reps-before-jump → snap and cap → explain. */
export function prescribe(ctx: ExerciseContext): Prescription | null;
```

- `packages/shared/src/training/engine/`: `prescribe.ts` (the pipeline), `rules/` (`double`,
  `linear`, `top-backoff`, `maintain`; later `percent`, `amrap-tm`), `stall.ts` (performance
  dominance, rule-aware), `explain.ts` (reasons and evidence), `context.ts` (pure assembly from
  rows).
- `packages/sync`: `loadExerciseContext(db, exerciseId, { workoutId, gymId, sessionId })`, used
  by Session start, the notification and the preview.
- `apps/native`: one `usePrescription(sessionExercise)` hook for the Session, preview, exercise
  page and notification host.

Stages stay pure and separately testable; the pipeline order makes precedence explicit
(today it is implied by `if` order inside one function).

### 5.4 What adding things costs

| Addition                     | Today                                                                                                                       | After §5.3                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A rule (%e1RM, AMRAP, waves) | New branches inside `suggestNext`, new context switches, every consumer updated.                                            | A `rules/` file, a `RuleConfig` variant, a simulation suite.                   |
| A set kind                   | `SET_KINDS` is a zod enum read by older apps; an unknown kind fails their parse.                                            | Same risk; needs tolerant readers first (§5.5).                                |
| A phase type (taper)         | `PHASES` enum in `phasePlanSchema`; an older app cannot read the plan and, editing it, replaces it whole (last write wins). | Tolerant reader plus "never write a plan you could not read".                  |
| Equipment                    | `SMALLEST_STEP` and several maps must cover every value.                                                                    | A load model per exercise (basis, step, grid) instead of per-equipment tables. |
| A unit                       | kg storage is sound; increments are untagged (B7).                                                                          | Unit-tagged step values.                                                       |

### 5.5 Data model changes and migration risks

All additive (ADR 0007), each riding `my_training` with the publication, stream, handler and
parity test updated in the order `.agents/sync.md` gives.

| Change                                                | Purpose                                                                 | Risk                                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `session_exercise.prescription` (JSON text, nullable) | Snapshot of rule, per-set suggestion, reasons, evidence, applied deload | Write per exercise at start; decide when it freezes (start, or first tick). Validate with zod on upload. |
| Applied stall deload inside that snapshot             | Replaces device memory (B3, B4)                                         | None beyond the column.                                                                                  |
| `workout_exercise.progression` (JSON text, nullable)  | Rule and parameters per exercise in a Workout                           | Null means today's double progression, so old rows need no backfill.                                     |
| `exercise_setting.training_max_kg` (nullable)         | Later: percentage and AMRAP programs                                    | Low.                                                                                                     |
| `training_session.readiness` (small int, nullable)    | Later: readiness                                                        | Low.                                                                                                     |

The real risk is enums, not columns. `SET_KINDS`, `PHASES` and the reason enum are parsed with
`z.enum` by apps already in users' hands. Before adding a value: ship readers that map unknown
values to a safe default (`working`, `build`) and refuse to rewrite a JSON plan they could not
fully parse; then use `minimum_app_version` for the writer. `phase_plan` is replaced whole on
write, so an older app that edits a plan would drop keys it does not know.

### 5.6 Tests

Keep the example tests; add two layers:

- **Simulation per rule.** Start from a Session, follow the suggestion (and variants: always
  one rep short, always RPE 10, a two-week break, a gym change), assert invariants: no stall
  while suggestions are met, loads always on the grid and at or under the cap, a deload never
  compounds, adding a set never changes another set's suggestion.
- **Parity.** One context through every builder (Session, notification, preview, exercise page)
  gives the same prescription. With §5.3 this is one test of `prescribe()` plus one per loader.

---

## 6. Prioritised plan

### 6a. Fix now

| ID  | Change                                                                             | Fixes         | Value   | Cost | Risk    | Sketch                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------- | ------------- | ------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | Effort relative to the target, one grind hold at most                              | B1            | High    | S–M  | Low–Med | `grindAt(target)` and `easyAt(target)` from the target's effort range, constants as fallback; skip the hold when the previous baseline already held at the same load and reps. |
| F2  | Stall by performance, not e1RM alone                                               | B2            | High    | S    | Low     | Improvement = more load at ≥ `reps_min`, or more reps at the same load, or e1RM +1%. Simulation test.                                                                          |
| F3  | One deload per stall episode, recorded on the Session                              | B3, B4        | High    | M    | Low–Med | Applied flag in the Session snapshot (or a small synced column); excluded from stall scoring; note quiet until the old best is passed or three Sessions go by.                 |
| F4  | Shared suggestion settings builder for Session and notification (until §5.3 lands) | B4            | High    | S    | Low     | One function used by `derive.ts` and `workout-live-logging.ts`.                                                                                                                |
| F5  | New slots do not block straight sets                                               | B5            | Med     | S    | Low     | `workingReady` ignores working slots beyond last time's working count.                                                                                                         |
| F6  | Realistic barbell steps                                                            | B6            | Med     | S    | Low     | Seed 0.5 kg plates disabled; automatic barbell step floor 2.5 kg / 5 lb unless a gym Load step; warm-ups round to 2.5 / 5 first.                                               |
| F7  | Unit-tagged increment                                                              | B7            | Med     | S    | Low     | Convert to the exercise unit's nominal step, or ignore when units differ.                                                                                                      |
| F8  | Kit and grid top as a cap                                                          | B8            | Med     | S    | Low     | Grid exposes its highest load; `raised === null` means at cap; copy names the plates.                                                                                          |
| F9  | Reset after repeated misses                                                        | B9            | Med     | S    | Low–Med | Two grind misses → load for `reps_min` from the miss's e1RM, rounded down to the grid; reason `reset`.                                                                         |
| F10 | Exercise page reads like the Session                                               | B10           | Med     | S–M  | Low     | Plan from the next or last-trained Workout; same-Workout baseline; phase; stall memory; "For Push A".                                                                          |
| F11 | Honest reasons                                                                     | B11           | Med     | S    | Low     | Split `hold`; factor in the result; per-outcome copy; i18n keys.                                                                                                               |
| F12 | Default steps that exist                                                           | B12, B22      | Med     | S–M  | Low     | Ask a machine's step once (cap-prompt pattern); belts step 1.25 kg pairs, kettlebells 4 kg.                                                                                    |
| F13 | Phase details                                                                      | B13, B14, B19 | Med     | S    | Low     | Snap-down tolerance; inserted deload restarts the pattern (if D4 agrees); phase-aware planned volume.                                                                          |
| F14 | Test week seeding                                                                  | B15           | Med     | M    | Low     | Single from e1RM × 0.9–0.95 with the break factor; optional work-up singles.                                                                                                   |
| F15 | Non-progressing kinds and back-offs                                                | B16, B17      | Low–Med | S    | Low     | Scale drop, failure and myo ghosts by the day's factor; back-offs move together.                                                                                               |
| F16 | Small fixes                                                                        | B18, B23–B26  | Low     | S    | Low     | Match duplicates by Session row; Maintain or longer dismiss; bodyweight break reset and a 70% tier; memoise sorted history; fix CONTEXT.md.                                    |

Suggested order: F4 and F11 (a day, immediate trust), F1, F2, F5, F7 (the engine stops
contradicting itself), F3 and F6, then the rest. Each change goes with the simulation tests in
§5.6.

### 6b. High-value improvements

| ID  | Change                                                                | Value | Cost | Risk | Sketch                                                                                                                                                           |
| --- | --------------------------------------------------------------------- | ----- | ---- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | `prescribe()` façade and one context loader for all surfaces          | High  | M    | Med  | §5.3. Migrate one consumer at a time behind a parity test.                                                                                                       |
| I2  | Evidence in every reason                                              | High  | S–M  | Low  | Engine returns baseline Session id, date, compared sets, factors and snapping; the reason sheet renders them in one or two lines.                                |
| I3  | Same-day adjustment, quietly                                          | High  | M    | Med  | After a working set misses or beats its target by two or more reps (or effort by 1.5), re-suggest only the unticked sets of that exercise; say why. Decision D9. |
| I4  | More reps before a big jump                                           | High  | S–M  | Low  | When the next grid load is more than about 10% heavier, extend the rep ceiling (as at a cap) before jumping.                                                     |
| I5  | Prescription snapshot, suggested-versus-done ledger, override prompts | High  | M    | Med  | §5.5. Prompts after two identical overrides: step, range, cap. Decisions D10, D11.                                                                               |
| I6  | Named rules per exercise                                              | High  | M    | Med  | Double (today), Linear with a failure policy, Top set with back-offs as a share, Maintain; a four-Session preview.                                               |
| I7  | RPE-aware e1RM                                                        | Med   | S    | Low  | e1RM from reps plus reps in reserve when effort is logged; used by Records, stalls and the Test seed. Records may move: say so once.                             |
| I8  | Assisted and timed progression                                        | Med   | S    | Low  | Assistance steps down to zero; planks and carries add 5 s or a step.                                                                                             |
| I9  | Simulation and parity suites                                          | High  | S–M  | Low  | §5.6.                                                                                                                                                            |
| I10 | Novice baseline                                                       | Med   | S    | Low  | Fixed-rep sets read the latest Session with the same prescription from any Workout. Decision D8.                                                                 |

### 6c. Later scope

| ID  | Change                                                              | Value                   | Cost | Risk     |
| --- | ------------------------------------------------------------------- | ----------------------- | ---- | -------- |
| L1  | Percentage of e1RM or training max, AMRAP-driven max (5/3/1), waves | High for strength users | L    | Med–High |
| L2  | Readiness: one quiet question that lightens the day                 | Med                     | M    | Low      |
| L3  | Peaking and taper; meet attempts from e1RM and the day's top set    | Med (niche)             | L    | Med      |
| L4  | Load seed on swap (e1RM × equipment ratio, labelled)                | Med                     | M    | Low      |
| L5  | Volume progression across a block; hard sets counted by effort      | Med                     | M–L  | Med      |
| L6  | Bands, chains, tempo and pause fields                               | Low–Med                 | M    | Low      |
| L7  | Machine profiles within one gym                                     | Med                     | M    | Low      |
| L8  | Run review built on the ledger                                      | Med                     | M    | Low      |
| L9  | Load basis and unilateral flag per exercise for volume              | Med                     | M    | Med      |

### 6d. Decisions for the owner

| ID  | Question                       | Options                                                                     | Recommendation                                                                        |
| --- | ------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| D1  | How effort affects progression | Absolute thresholds (today); relative to the target; ignore effort          | Relative, with today's thresholds when no target; one hold at most.                   |
| D2  | What a stall is                | 1% e1RM (today); performance dominance; suggestion not met N times          | Dominance now; "not met three times" once snapshots exist.                            |
| D3  | Deload rounding                | Always down (today); nearest; down within a tolerance                       | Down within about 5 points, else nearest; show the real cut.                          |
| D4  | Insert deload now              | Shift the plan (today); restart the pattern                                 | Restart: an inserted Deload replaces the next planned one.                            |
| D5  | Phases and missed weeks        | Calendar (today); pause the Run; phases per Cycle                           | Keep the calendar, add "Pause Run" (weeks stop counting) and skip Test after a break. |
| D6  | Test week                      | Single at the last working load (today); e1RM-based single; AMRAP only      | e1RM-based RPE 8–9 single with work-up singles; the result updates e1RM.              |
| D7  | Defaults                       | Fractional plates on, machines 1 kg (today); off and 5 kg / 10 lb; ask once | Fractional off; ask a machine's step once, 2.5 kg / 5 lb until answered.              |
| D8  | Novice LP baseline             | Same Workout (today); any Session; same prescription                        | Same prescription for fixed-rep sets; same Workout for ranges.                        |
| D9  | Same-day adjustment            | None (today); always; only on a large deviation                             | Only on a large deviation, unticked sets only, with a one-line reason.                |
| D10 | Learning from overrides        | None but the cap prompt (today); prompts; silent adaptation                 | Prompts. Silent drift contradicts "honest".                                           |
| D11 | Prescription snapshot          | No (today); yes, synced to the account                                      | Yes: needed for parity, honest stalls and the ledger; it is the user's own data.      |

---

## Appendix: probe outputs

All runs against HEAD `12f01f239`, kg unless marked. The probe files lived in the session
scratchpad and are not part of the repository.

```
Effort
3x8-12 @60 all 12 reps, RPE 8/9/10             hold_effort | 60x12 ×3
3x8-12 @60 all 12 reps, no RPE                 add_weight  | 62.5x8 ×3
1x6-10 planned RPE 9.5-10, 10 @10, 4 Sessions  hold_effort | 80x10
2x5 planned RPE 7, logged 5 @7                 add_weight  | 105x5 (+5)
Build after Push: 8 @9.5                       hold_effort | 100x8
missed min four Sessions (6 of 8-12)           hold        | 60x6 ×3

Seeded kg gym kit, barbell x5
20→21  40→41  60→62  80→82  100→103  120→123  140→144  180→185  220→226
home kit 60→62.5 100→102.5; lb kit 135→140 225→230 315→325
warm-up ramp to 140: 20x10 70x5 98x3 119x1

Defaults without a gym setting
machine 20→21, 50→51, 90→92; lb cable 50→52.5; dumbbell 8→9, 10→12.5, 30→32.5
kettlebell 16→18; dips +20→+21; pull-up +0→+1
lb override, global 2.5 kg increment: 100 lb → 105.5 lb; kg override, 5 lb increment: 60 → 62.25

Home kit max 115 (20 bar, 2×20, 1×5, 1×2.5 pairs): 115x12 → hold 115x12, again hold 115x12
Stack 5-90: 90x12 → cap_reps 90x13; 90x18 → cap_hint; 95x10 → capped 90x10

Engine-driven 3x8-12 from 60x8
62.5x10 stall=3; 65x10 stall=3 (all other Sessions 0)

Stall deload
stalled at 100x5 → apply 90x5 → stall 4, note again → apply 80x5; not applied: 92.5 (stall 5), 95 (stall 6)

Breaks: 14 d 90x8; 27 d 90x8; 28 d 80x8; 400 d 112.5 from 140; push-ups 90 d → 13 reps

Deload 0.9, snapped down
dumbbell 8→7, 10→9, 12.5→10, 15→12.5, 22.5→20, 30→25, 40→35
stack by 5: 15→10, 25→20, 45→40, 50→45, 70→60; lb stack by 10: 60→50 lb
applyPhase deload: top 140x3@8 → 125x3@6, back-offs 120 → 107.5, drop set removed
Test single from 5x5 @100 → top 100x1

Calendar
BBBD, insert deload in week 3 → b b d b d b b b d
same instant: Run week 3 in Los Angeles, 4 in Kolkata; DST (New York) correct

Structure
3 planned → add_weight 62.5x8 ×3; add a 4th set → hold 60x12 ×4; remove one → add_weight
merged duplicate entries → second entry 100x6; back-offs 120x4,120x5 → 120x5, 122.5x5

Novice LP, squat 3x5 in Workouts A and B alternating
same_workout: 60 62.5 62.5 65 65 67.5 67.5 70
any_session:  60 62.5 65 67.5 70 72.5 75 77.5

Long history (500 Sessions, Node): 40 Previous lookups 6.2 ms; stall pass 7.2 ms (stalled = 499)
```
