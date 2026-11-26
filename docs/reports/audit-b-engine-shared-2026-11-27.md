# Pre-release audit B: training engine in packages/shared, 27 November 2026

Read-only audit of `git diff origin/main...HEAD -- packages/shared` on `feat/redesign` at
`87ac951ce` (94 files, +11,405 / −520). No source file was changed. Terms follow
[CONTEXT.md](../../CONTEXT.md). Read alongside the specs
([gyms-phases-train-round](../specs/training/gyms-phases-train-round.md) §3, §4 and §9,
[navigation-round](../specs/training/navigation-round.md)) and the earlier
[engine review](engine-review-2026-11-25.md), whose fixes were re-checked (see "Earlier fixes").

**Evidence.** _probe_: a throwaway vitest file in the session scratchpad, run against the code at
HEAD through `prescribe()` or the named function, with the output quoted. Nothing from the probes
is in the repository. _code_: read in the source. Paths are relative to
`packages/shared/src/training` unless they start with `apps/`, `packages/` or `src/`.

**Suite.** `vitest run` in `packages/shared`: 70 files, 1,211 tests, all passing.

**Scales.** Critical: data loss or a crash for many users. High: a crash, a failed write or a
frozen screen for a real group, or a clearly wrong load. Medium: a wrong suggestion or a broken
promise that a real lifter will meet. Low: an edge case, a drift risk or polish.

---

## Summary

The engine round held up well. The fixes from the 25 November review are in and behave as
specified (B1–B26, one partial). The rule seam, snapshot and evidence are sound for the common
cases, and the suite tests behaviour, not internals.

What this audit found is at the edges the new features opened:

- **One crash path.** The Top set and back-offs rule on a weighted pull-up or dip done at +0 kg
  writes `loadFactor: NaN` into the outcome, and the snapshot schema throws when it is captured.
- **Two hot paths.** `runWeek` builds a new `Intl.DateTimeFormat` on every call once a Run has
  been paused; `undoableDeloadWeek` calls it once per Session of the Run, on every Train and Home
  render (56 ms in Node for 200 Sessions and one pause). The stall verdict scans the whole history
  twice per exercise, and Home asks it for every exercise of the week on every render.
- **Phase and week semantics.** "Undo deload" is impossible after the most common mis-tap (a
  Deload inserted mid-week after a Build Session). A Deload whose load share is 100% still adds
  weight. Patterns that do not end in Deload restart in the wrong place after an inserted Deload.
- **Baselines.** The novice "same prescription from any Workout" baseline (D8) compares warm-ups
  too, so the Workout preview and the Session read different baselines, and a ramp of a different
  length silently turns it off.

| Severity | Count | FIX NOW | LATER | SKIP |
| -------- | ----- | ------- | ----- | ---- |
| Critical | 0     | 0       | 0     | 0    |
| High     | 2     | 2       | 0     | 0    |
| Medium   | 5     | 5       | 0     | 0    |
| Low      | 12    | 5       | 6     | 1    |
| Total    | 19    | 12      | 6     | 1    |

### FIX NOW batches

Batches group files so one agent can take each; B and C touch two shared files and should run in
the order given.

| Batch                                          | Findings            | Files                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** Rules, steps and snapshot safety         | A1, A9, A11, A12    | `engine/rules/top-backoff.ts`, `engine/preview-rule.ts`, `phases/test-load.ts`, `progress/progression-steps.ts` (and its callers in `engine/pipeline.ts`, `engine/rules/double.ts`, `engine/rules/linear.ts`)                                                                                                                                                                       |
| **B** Phases, Deload weeks and weeks           | A2, A3, A4, A8, A10 | `plans/cycle.ts`, `phases/phases.ts`, `engine/pipeline.ts`, `engine/prescribe.ts`, `progress/suggestion-context.ts`, `progress/same-day-adjustment.ts` (deload guard); callers `packages/sync/src/training/plans/run-store.ts`, `packages/api/src/training/run-sync.ts`, `apps/native/src/training/phases/use-deload-week.tsx`, `apps/native/src/training/home/training-nudges.tsx` |
| **C** Baselines, same-day steps and stall cost | A5, A6, A7          | `progress/suggestion-history.ts`, `progress/same-day-adjustment.ts` (`stepLoad`), `progress/stalled-lift.ts`, `progress/suggestion-context.ts`; memo in `apps/native/src/training/home/training-nudges.tsx`                                                                                                                                                                         |

Each batch adds the failing probe below as a test next to the code (behaviour through
`prescribe()`, `phaseFor()`, `undoableDeloadWeek()` and so on, not internals).

---

## Findings

Ordered by severity. Each: where, the failing input and the wrong output, the fix, the verdict.

### A1 · High · Top set + back-offs at +0 kg writes NaN and the snapshot capture throws

_probe, code._ `engine/rules/top-backoff.ts:222, 241`; snapshot schema
`progress/prescription.ts:15` (`loadFactor: z.number().nonnegative()`); capture
`packages/sync/src/training/sessions/prescription-store.ts:66` (`prescriptionSchema.parse`).

- Input: weighted pull-ups (`bodyweight_weighted_reps`), rule Top set and back-offs, last Session
  top +0 kg × 6, back-off +0 kg × 8 (the usual way to start a weighted lift).
- Output: `add_rep 0×7 0×9`, back-off outcome `{"reason":"backoff_share","loadFactor":NaN}`
  (`load / topLoad` = 0 / 0). `prescribedSetSchema.safeParse` of that set: "expected number,
  received NaN". The native draft copies outcomes as they are
  (`apps/native/src/session/logging/logging-ghosts.ts:67`), so `capturePrescriptionIn` throws inside
  its write: no snapshot is ever captured for the exercise, on screen or from the live notification,
  and every retry fails the same way.
- Fix: `loadFactor: topLoad > 0 ? load / topLoad : undefined` in top-backoff; defensively drop
  non-finite numbers from outcomes where the draft is built (one helper in shared, used by
  `prescriptionDraft`). Test: Top set + back-offs at +0 kg through `prescribe()` produces an
  outcome that `prescribedSetSchema` accepts.
- **FIX NOW**: a failed write on a common setup (bodyweight pull-ups and dips with back-offs).

### A2 · High · `runWeek` with pauses rebuilds `Intl.DateTimeFormat` per call; Undo checks call it per Session, every render

_probe, code._ `plans/cycle.ts:145` (new formatter in every call once `pauses` is non-empty);
loops `phases/phases.ts:305` (`undoableDeloadWeek`: one `runWeek` per `trainedAt`), `:259`
(`phaseFor` Test check); callers `apps/native/src/training/phases/use-deload-week.tsx:53` (every
render of Train's week sheet and Home's nudge) and the server's own copy
`packages/api/src/training/run-sync.ts:100`.

- Input: a Run with one past pause, 200 counted Sessions, current week an inserted Deload.
- Output: `undoableDeloadWeek` takes **55.9 ms per call in Node** (0.05 ms without the pause).
  Hermes builds `Intl` formatters several times slower, so a lifter who has paused once gets a
  visibly slower Train and Home on every render.
- Fix: cache the formatter per time zone at module level (as `calendarDay` in `plans/week.ts:11`
  already does); in `undoableDeloadWeek` and `phaseFor`, walk Sessions newest first and stop at the
  first one in an earlier week (`runWeek` is monotonic in time), so only this week's Sessions are
  converted. Apply the same early stop on the server copy.
- **FIX NOW**: every render of two main screens, for every user with a paused Run.

### A3 · Medium · "Undo deload" is impossible after the most common mis-tap

_probe, code._ `phases/phases.ts:292–309`; same rule on the server
`packages/api/src/training/run-sync.ts:99–106` (`RUN_DELOAD_LOGGED`) and in
`packages/sync/src/training/plans/run-store.ts:136–149`.

- Input: Run in week 4, a Build Session logged Monday, "Deload this week" tapped Wednesday.
- Output: `undoableDeloadWeek` → `null` one minute after the insert. Any counted Session of that
  Run week blocks it, including the Build Session logged before the Deload existed.
- Expected (navigation story 21, CONTEXT "Inserted deload"): undo until a Session is logged
  _as the Deload_. A Session snapshots its phase at start (`training_session.phase`), so only
  Sessions of that week with `phase = 'deload'` should block.
- Fix: `trainedAt` carries the phase (or callers pass only Deload-phase starts); the run-store
  query and the server check filter on `phase = 'deload'`. Keep the shared function the one rule
  and have the server call it, so the two copies cannot drift again.
- **FIX NOW**: a promised undo that does not work in the case it exists for.

### A4 · Medium · A Deload week whose load share is 100% adds weight

_probe, code._ `engine/pipeline.ts:107–112` (only `phaseLoad < 1` resets),
`progress/same-day-adjustment.ts:204–211` (only `reason === "deload"` stops a raise).

- Input: Deload modifiers edited to load 100% (a volume-only deload: sets halved, −2 RPE),
  3 × 8–12, last 60 × 12, 12, 12.
- Output: Build week `add_weight 62.5×8`; **Deload week `add_weight 62.5×8 62.5×8`**. The reason is
  `add_weight`, so same-day adjustment may also raise loads in that Deload. The Session is not a
  baseline, so the next Build week proposes 62.5 again: the Deload week was asked to be the
  heavier week.
- Fix: carry "this Session is a non-baseline Deload" into `prescribe()` (the phase is already on
  the place in native); in a Deload with a share of 1, propose the baseline load at the bottom of
  the range with reason `deload` and `share: 1`, so the banner, the evidence and same-day
  adjustment all read it as a Deload.
- **FIX NOW**: a wrong suggestion in a week built to be easy; small, local change.

### A5 · Medium · The fixed-rep "any Workout" baseline compares warm-ups, so surfaces disagree

_probe, code._ `progress/suggestion-history.ts:342–366` (`completed.length === prescription.length`
and index-by-index match including warm-ups).

- Input: squat 3 × 5 in Workouts A (100 kg) and B (102.5 kg, newer). Next Session of A.
- Output with no warm-ups in history: plan without warm-ups → `105×5` (reads B, as D8 asks); the
  same plan with two warm-ups → `102.5×5` (reads A's own). With warm-ups in history it is the other
  way round. The Workout preview passes the Workout's planned sets (no auto warm-ups) and the
  Session passes its rows (with them), so they show different loads; and a ramp that grows a step
  as the load rises silently ends the match, bringing back the half-speed novice progression
  of B21.
- Fix: compare only non-warm-up sets on both sides (`progresses(kind)`, or `kind !== "warmup"`),
  index by index among those.
- **FIX NOW**: D8 was taken as a decision; today it depends on warm-up counts.

### A6 · Medium · A same-day miss at a rack boundary drops a whole coarse step

_probe, code._ `progress/same-day-adjustment.ts:140–148` (`incrementFor(weight…)` uses the step
_above_ the load, then `nearest(start − step)`).

- Input: dumbbells 3 × 10 at 10 kg (default rack: 1 kg steps to 10, then 2.5), set 1 done 10 × 7.
- Output: the other sets move to **7 kg** (−30%). Expected 9 kg, the next dumbbell down. In lb the
  same happens at 25 lb (→ 20 instead of 22.5) and on any gym's multi-range grid at a range edge.
  At 22.5 kg it is correct (→ 20).
- Fix: for a lighter step use the step below the load: `incrementFor(physical.below(start) ??
  weight, …)` (or simply `physical.below(start)` when the computed point skips more than one
  point).
- **FIX NOW**: a common accessory load, and a cut three times larger than the rule intends.

### A7 · Medium · The stall verdict scans the whole history twice per exercise, uncached

_probe, code._ `progress/stalled-lift.ts:92–134` (`episodeBaselines` computes
`performanceByKind` for every Session of the episode before cutting at the first gap),
`:147` and `:285` (both `stalledSessions` and `missedSuggestions` call it),
`progress/suggestion-context.ts:155–156`; caller `apps/native/src/training/home/training-nudges.tsx:101`
(`stalledExerciseIds` on every Home render, not memoised).

- Input: 500 Sessions of one exercise (the history watch limit).
- Output: `suggestionContext` with stalls 2.7 ms in Node, 0.16 ms without; each of the two stall
  passes about 1 ms. Home calls `prescribe` for every entry trained this week (4 Sessions × 6
  exercises = 24 calls, about 65 ms in Node) on every render; Hermes is several times slower. The
  Session screen caches per exercise, Home does not.
- Fix: compute the episode once and share it between the two counts; compute performance lazily
  and stop at the first gap or the first improvement; cache the verdict per history array and
  options in a `WeakMap` (as `suggestionHistory` does). In native, memoise `stalledExerciseIds` on
  its inputs.
- **FIX NOW**: Home is the first screen; the cost grows with every Session logged.

### A8 · Low · An inserted Deload restarts the pattern at its first week, not after the replaced Deload

_probe, code._ `phases/phases.ts:189–205` (`patternStart = inserted + 1`, while overrides read
`programWeek = week + offset`); Home's nudge offers "Deload this week" in a scheduled Deload week
(`apps/native/src/training/home/training-nudges.tsx:141`, the week sheet hides it).

- Pattern `D B B B`, insert in week 5 (already a Deload): weeks 5 and 6 are both Deload.
- Pattern `B B D B`, insert in week 1: Deloads in weeks 1 and 4 (two Build weeks between, the
  pattern has three), and run week 4 is labelled Program week 6, whose pattern phase is Build, so
  an override set on that strip cell lands on a week that shows a different phase.
- The presets all end in Deload, where both readings agree; custom patterns from Plan your weeks
  do not.
- Fix: read the pattern position from the Program week (`pattern[(programWeek − 1) % length]`)
  and drop `patternStart`; for presets the result is unchanged. Hide the Home action while the
  current week is already a Deload.
- **FIX NOW**: cheap, and the phase batch already touches the file.

### A9 · Low · Weighted bodyweight resets and Deloads round to 1 kg while increments are 1.25 kg

_probe, code._ `progress/progression-steps.ts:254` (`lightenLoad`'s default step ignores the
exercise type), `:86` (`defaultStepKg` returns 1.25 kg for `bodyweight_weighted_reps`).

- Input: dips +20 kg × 4 at RPE 10, twice, bodyweight 80 kg, range 6–8.
- Output: reset `13×6` (1 kg grid); a Deload or break gives 18 kg; the next add is +1.25 → 14.25
  kg. Neither 13, 18 nor 14.25 is loadable with 1.25 kg plates on a belt.
- Fix: pass the exercise type into `lightenLoad` (pipeline, double, linear) and use
  `defaultStepKg(equipment, unit, load, type)` there.
- **FIX NOW**: same batch as A1; one parameter.

### A10 · Low · "Skip Test after a break" depends on the clock time, not the calendar

_probe, code._ `phases/phases.ts:255` (`after − before >= 14 × 86_400_000`); also
`progress/progression.ts:158` (break tiers by elapsed milliseconds).

- Input: Run with pattern `B B B T`, last Session Tue 13 Jan, today Tue 27 Jan (week 4, Test).
- Output: last Session at 18:00 → Build; at 19:30 → Test. Fourteen calendar days either way. A
  Workout preview at 18:00 and the Session started at 19:30 can show different weeks.
- Fix: `phaseFor` has the time zone; compare `calendarDay(now) − calendarDay(before)` in days.
  `trainingBreak` has no time zone today; leave it (LATER) or give it one.
- **FIX NOW** for `phaseFor` (one line); LATER for `trainingBreak`.

### A11 · Low · The rule preview drifts from the engine for Top set + back-offs

_probe._ `engine/preview-rule.ts:131–147` (made-up Sessions carry no `suggested.share`).

- Input: top 140 × 3, back-offs 120 × 5, rule Top set and back-offs, eight weeks previewed.
- Output: preview `150/130/130` in week 4, the engine followed exactly `150/127.5/127.5`; by week
  8, 160/140 against 160/137.5. The preview re-derives the share from rounded loads each week, the
  creep the snapshot's `share` exists to prevent.
- Fix: write `suggested: { weight_kg, reps, share: outcome.share }` on the preview's made-up sets.
- **FIX NOW**: the sheet promises "what the rule asks of the next four sessions".

### A12 · Low · Test seed for a weighted bodyweight lift can subtract no bodyweight at all

_probe, code._ `phases/test-load.ts:66` (offset from `options.bodyweightKg`, the estimate from each
set's own `bodyweight_kg`).

- Input: dips +20 kg × 5 with a set snapshot of 80 kg bodyweight, no current bodyweight passed.
- Output: seed **104 kg** of added load (the whole e1RM × 0.925). With today's weight it is right
  (90 kg today → +14 kg). The Session-start path reads today's weight whenever any weigh-in exists
  (`packages/sync/src/training/sessions/phase-inputs.ts:139–150`); the Workout preview reads weights
  on exact dates and falls back to the account weight
  (`packages/sync/src/training/sessions/exercise-history.ts:50`), a second copy of the lookup that
  can give the two surfaces different seeds.
- Fix: when `bodyweightKg` is missing, subtract the bodyweight of the set the estimate came from;
  share one bodyweight lookup between the two sync paths.
- **FIX NOW** for the guard (one line); LATER for the shared lookup.

### A13 · Low · A missed rep at a grind holds the missed reps, below the plan

_probe._ `engine/rules/double.ts:182, 203`.

- 3 × 5 at 100 kg logged 4, 4, 4 at RPE 10 → `hold_missed 100×4`. Ticking the ghost logs 4 reps
  on a 5-rep plan, and the ledger then reads it as met. Maintain already holds reps at the range's
  minimum; Double's hold does not.
- Fix: a hold asks for `max(before.reps, reps_min)`.
- **LATER**: changes what the hold copy means; one product decision.

### A14 · Low · A Deload on a coarse stack can keep the full load

_probe._ `progress/progression-steps.ts:229–236, 269`.

- 5 kg stack at 15 kg: 90% is 13.5; down is 10 (−33%, outside five points), nearest is 15. Deload
  suggests 15 kg, a 0% cut, under a banner that says "−10% load". 25 kg on the same stack → 20 kg
  (−20%), which is fine.
- Fix (owner decision, D3): when nearest is no cut at all, take the step down.
- **LATER**: follows the agreed D3 rule literally; sets and effort still drop.

### A15 · Low · A jump to a cap barely above the last load resets the reps

_probe._ `engine/rules/double.ts:257–272`, `progress/progression-steps.ts:198`.

- Machine with Max load 91 kg and no step, last 90 × 12 on 8–12 → `add_weight 91×8`: +1% load for
  four fewer reps. The spec's "suggest the cap exactly" was meant for a step that overshoots.
- Fix: when the cap is less than half a step above the last load, treat the load as at the cap
  (`cap_reps`).
- **LATER**: needs a cap set between pins; the spec rule is followed.

### A16 · Low · At a cap, the extra rep counts as a missed suggestion

_code._ `progress/suggestion-ledger.ts:40–42` exempts only `more_reps`.

- At the cap, `cap_reps` asks 13 on 8–12; doing 12 three times counts three missed suggestions
  (and no improvement), so the "Suggestions have been ahead of you" note can appear for a lifter
  who did the planned range every time.
- Fix: give `cap_reps` the same `extraReps` as `more_reps`.
- **LATER**: rare (needs a cap and three flat Sessions).

### A17 · Low · The 14-day break rule lives in four places

_code._ `progress/progression.ts:136`, `progress/stalled-lift.ts:19`, `phases/phases.ts:255`
(inline), and the server's copy of the Undo rule (A3).

- All agree today. A change to one (A10's calendar days) will make the Test skip, the break
  factor and the stall gap disagree.
- Fix: one exported constant and one "days between" helper.
- **LATER**: drift risk only.

### A18 · Low · A known rule with an unknown option reads as Double on an older build

_code._ `engine/rule-config.ts:267–278` (`strictObject` per rule), `:294`.

- A newer build that adds an option to Linear (say a custom step) writes
  `{ "id": "linear", "step": 5 }`; an older build fails the strict parse and reads Double, so the
  two phones of one lifter suggest different loads until both update.
- Fix: strip unknown keys per rule (`z.object`) and keep the id; refuse only unknown ids.
- **LATER**: no such option exists yet; decide before the first one ships.

### A19 · Low · The snapshot schema refuses values the engine can produce

_code._ `progress/prescription.ts:17` (`ceiling` at most 999), ghost reps at most 999;
`engine/ceiling.ts:20` gives `round(reps_max × 1.5)`, and bodyweight reps climb by one forever.

- A range topping at 666 or more, or a 999-rep bodyweight set, makes `prescriptionSchema.parse`
  throw, as in A1.
- Fix: clamp `ceiling` and suggested reps to the schema's bounds.
- **SKIP**: unrealistic inputs; A1's defensive sanitiser covers it if built generally.

---

## Earlier fixes (engine review, 25 November): status

Probed or read again at HEAD. "Held" means the failing case from the review now gives the
expected result.

| ID  | Status  | Evidence at HEAD                                                                                                                |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Held    | 12/12/12 at RPE 8/9/10: one `hold_effort`, then `add_weight 62.5×8`. A target of RPE 9.5–10 met at 10: adds load every Session. |
| B2  | Held    | Stall is by improvement (load at ≥ minimum reps, reps at a load, or +1% e1RM); simulation suites cover it.                      |
| B3  | Held    | Stall deload applied at 100 → 90; following Sessions 92.5, 95, 97.5, 100 with no stall note.                                    |
| B4  | Held    | Notification and Session both go through `prescribe()` and the snapshot.                                                        |
| B5  | Held    | Four sets after three at 60 × 12: `add_weight 62.5×8` ×4.                                                                       |
| B6  | Held    | Seeded fractional plates off; kit steps 60 → 62.5 → 65 kg and 135 → 140 lb; warm-ups round to 2.5 / 5 first.                    |
| B7  | Held    | Increment carries its unit (`weightIncrementUnit`), converted per exercise unit.                                                |
| B8  | Held    | Home kit top 115 × 12 → `cap_reps 115×13`.                                                                                      |
| B9  | Held    | Two grind misses at 100 → `reset 95×5`.                                                                                         |
| B10 | Held    | Exercise page uses `prescribe()` (native).                                                                                      |
| B11 | Held    | `hold` split into `hold_missed`, `hold_together`, `hold_effort`; factor carried in outcomes and evidence.                       |
| B12 | Held    | Machines and cables default to 2.5 kg / 5 lb; step prompt asks once.                                                            |
| B13 | Held    | Deload rounds down within five points else nearest (12.5 → 10, 30 → 27.5 on dumbbells); residual case A14.                      |
| B14 | Partial | Presets (Deload last) restart correctly; patterns not ending in Deload do not (A8).                                             |
| B15 | Held    | 5 × 5 at 100 → single 105 (e1RM × 0.925), 20 days off → 92.5, work-ups 85 and 95; AMRAP keeps 100 × 5.                          |
| B16 | Held    | Drop set after 35 days: 75 → 60; in a Deload 75 → 67.5.                                                                         |
| B17 | Held    | Back-offs 120 × 6 and 120 × 5 → both 120 × 6.                                                                                   |
| B18 | Held    | History matched by source Workout entry and entry ordinal (`suggestion-history.ts`).                                            |
| B19 | Held    | Planned muscle volume takes the phase's set factor; Test counts the main lift once.                                             |
| B20 | Held    | Pause Run implemented (`runWeek` subtracts paused local days; DST safe). Cost: A2.                                              |
| B21 | Partial | Fixed-rep any-Workout baseline exists, but depends on warm-up counts (A5).                                                      |
| B22 | Partial | Kettlebell 4 kg and belt 1.25 kg steps in; resets and Deloads still round belts to 1 kg (A9).                                   |
| B23 | Held    | Maintain rule: no stall, reps never below the minimum.                                                                          |
| B24 | Held    | Push-ups after 90 days → 8 (bottom of range); 84+ days → 70%.                                                                   |
| B25 | Partial | Previous lookups memoised per history; stall passes still scan everything (A7); new `runWeek` cost (A2).                        |
| B26 | Held    | `session-goal.ts` matches CONTEXT.md (Program goal, then preference, then short Rotation).                                      |

## Checked and sound

- kg and lb round trips on kits, dumbbell racks (25 → 22.5 lb on a Deload), caps in lb under kg
  limits, dumbbell max per hand (100 lb max: `cap_reps` at 100 × 12, 95 → 100 lb).
- Plate solver cost: 0.2–0.4 ms per `loadBar` call in kg and lb kits; bar grid caches above and
  below.
- Linear (hold, then −10% rounded down after a second miss at one load), Maintain, assisted and
  timed rules on single steps; the "more reps before a big jump" sequence on dumbbells, cables and
  kettlebells.
- Same-day adjustment on barbells (100 → 97.5 on a 3-rep miss, → 102.5 on +2), effort-only misses,
  heavier-set conversion (105 × 4 against 100 × 5 moves nothing).
- Phase snapshot, Push and Deload effort shifts clamped to 6–10, Test single detection, Lighter
  week and stall deload not compounding with a Deload phase (the stricter factor wins).
- Hints: dismiss, replay and the 100-id limit; preferences: new fields default for older rows,
  prompt lists bounded by their writers.
- Tests: behaviour through public functions and `prescribe()`; no module mocking; no snapshot tests.
