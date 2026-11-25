# Gyms, phases and Train round

Agreed 2026-11-24 in a grilling session. Covers three bug fixes, the Train/Program/Workout
restructure, Run cycle visibility, Gyms with load caps, week phases, equipment-aware swaps,
catalog additions, and an engine review afterwards. Terms follow [CONTEXT.md](../../../CONTEXT.md).

## Sigil's own take

Owner direction (2026-11-24): Sigil is not a Hevy or Lyfta clone. Competitor research shows what
exists; Sigil's choices follow its own brand ([SPEC](../../design/sigil/SPEC.md)): quiet,
stoic, ink first, ember only for "you / earned", hairline construction, plain words, no hype.

- **Voice.** Short, factual, second person, no exclamation marks, no emoji, no streak guilt.
  Notifications state a fact ("Upper A is next."), never nag ("Don't break your streak!").
- **No gamification.** No confetti, badges, streak flames or social prompts. Records are marked
  with the ember, quietly.
- **Run as a ledger.** The cycle strip is a row of marks: done = filled ink mark,
  skipped = hollow mark with a hairline slash, next = ember dot, rest = a short hairline. It reads
  like a mason's tally, not a progress bar.
- **Phases as a shape.** The Program's week strip is a small block chart: each week a flat
  block whose height shows its intensity (Deload low, Test tallest), so the block's shape is
  visible at a glance; the current week carries the ember dot.
- **Covers.** Program and Workout covers show the original photo for now. A two-ink (ink/ivory)
  treatment is a later brand task; it needs an image pipeline the app does not have yet.
- **Program grid.** Flat surfaces with no borders, gradients or shadows (the UI guide's
  no-borders rule); Geist titles (serif stays on brand surfaces); meta in small technical labels
  (days, weeks, phase).
- **Caps in plain words.** At a machine's max the set row shows a small "Max · reps now" label;
  past the rep ceiling "Max reached · add a set or go single-arm". No modal, no alarm colour.
- **Pinned, not favourited.** Exercises are "Pinned" (Sigil already pins notes); pinned
  exercises lead the picker.
- **Body map first.** The exercise library opens with the monochrome body map as its filter;
  search sits above it.
- **Your record.** Export is framed as ownership: "Your record", files named
  `sigil-record-YYYY-MM-DD.json` / `.csv`.
- **Notifications grouped by meaning:** Training, Body, Records. Every one is off by default
  except those the user already turned on.

## Order

1. Bugs: keyboard on launch, Google retry, swipe.
2. Train / Program / Workout UX, Run cycle strip, choose day, skip.
3. Gyms (minimal, hidden while one gym), then caps, load step and setup notes.
4. Phases.
5. Gym equipment and equipment-aware swaps.
6. Catalog. Data-only, runs in parallel from the start.
7. Engine review (after 1–6 land).
8. Follow-up: F1 notifications and F2 export start now; F3 after slice 3 merges.

Implementation slices go to Sonnet (medium); reviews and review fixes go to Codex `gpt-6.2-sol`.
Each slice runs lint, typecheck, knip, test and i18n:check before it is called done.

## 1. Bugs

**Keyboard opens over the welcome animation.** `welcome-screen.tsx` always renders `EmailSheet`.
HeroUI keeps closed sheet content mounted (opacity 0), so the email `Field` with `autoFocus`
(`src/auth/components/email-sheet.tsx:94`) focuses on first render. Fix: focus only after the
sheet has opened (or render the field only while open). Check `change-email-section.tsx:87,109`
for the same pattern.

**Google sign-in does nothing after a cancel (Android).** `google-button.tsx` returns early while
`pending`, and `pending` clears only in `finally`. After a cancel, `authClient.signIn.social`
(Better Auth Expo plugin awaiting `openAuthSessionAsync`) or `refreshSession` never settles; the
Android fallback in expo-web-browser waits for an AppState event. Fix: log around both awaits to
confirm, dismiss any leftover auth session before each attempt, and clear `pending` when the app
returns to the foreground without a session (plus a bounded timeout).

**Swipe never moves.** One shared component, `src/platform/ui/swipe-row.tsx`, used by set rows,
Train plan rows and exercise rows. When the pan activates, gesture-handler cancels the RN touch;
on Android the cancel event is at (0,0). `SwipeDismissSurface.onTouchCancel` reads `dy >= dx` as
a scroll and calls `closeOpen()` on the row being dragged; since `0bf17dbe8`, `onUpdate` and
`onDeactivate` exit early while `closing`, so the row never follows the finger. Fix in place:

- a row ignores the touch-cancel caused by its own pan (and cancels at (0,0));
- `closeOpen` never closes the row currently dragging; drop the `closing` early exit in `onUpdate`;
- loosen `failOffsetY` from ±10 to ±20;
- follow the finger on the UI thread without waiting for `layerReady` from JS.
  Verify on the Android device on set rows, Train rows and exercise rows. If it still fails, fall
  back to gesture-handler's `ReanimatedSwipeable` and rebuild the one-open-row group on top.

## 2. Train, Program and Workout UX

**Train page**, top to bottom:

1. Resume card while a Session is in progress.
2. Active Run hero: cover, "Week 3 of 12", phase chip (from slice 4), cycle strip, Start next.
3. Programs: 2-column grid of cover cards in the Program-page style; tap opens the Program.
   Program Workouts are no longer flattened into Train.
4. Workouts: standalone Workouts only, as a list; search and sort (recent / name) once there are
   more than about 8.
   Create and Start empty move into the header.

**Cycle strip, choose day, skip.** Out-of-order training already works in the data model
(`cycle.ts`, `session-store.ts:84-134`): starting Workout 3 marks its first untrained Slot and
"Up next" stays on 2. Add:

- a cycle strip on the Run hero: one dot per Slot (done / next / rest);
- tapping a dot opens a sheet to start that day;
- a ✓ on Program rotation rows for Slots done in the current Cycle;
- "Skip this cycle" on a Slot: a small synced record that counts the Slot as done for that Cycle,
  so a deliberately skipped day no longer blocks the Cycle. The Program order never changes.

**Workout editing.** Today every route from a Program opens the read-only preview, even
"Edit workout", and the name/note fields hide behind ⋮ → Edit details. New structure:

- the editor always shows cover, name and note at the top; remove the Edit details toggle;
- "Edit workout" (slot ⋮ and swipe) opens the editor directly; fix the stale comment at
  `program-screen.tsx:58`;
- the preview header gets a pencil; tapping the title opens a quick rename;
- tapping an exercise's set table in the preview opens its planned-sets sheet.
  Result: rename 1–2 taps (was 4–5), planned sets 1 tap (was 3–4), Program details 1 tap.
  This supersedes the "title and note editing belong in the overflow menu" line in
  [training-product-decisions.md](../../training-product-decisions.md); update that doc.

**Workout covers.** Mirror Program covers: `workout_cover` media kind, `cover_media_id` on the
client and server workout tables, a sync check like `assertMediaReference(..., "program_cover")`,
a store function and a hook like `useProgramCover`. Shown on Workout rows, the preview header,
the Run hero's next day and the Workout share card; fallback is a small muscle-map tile. Copies
into and out of a Program keep the cover. Follow [media](../../../.agents/media.md).

## 3. Gyms, caps, load step, setup notes

Why: Sigil prescribes the next load, so a suggestion above a machine's stack (91 kg pec fly) or
between its pins is wrong. Hevy and Strong do not prescribe loads and have no such setting;
Alpha Progression (gym profiles with min/max/interval weights), Fitbod (gym locations) and Steady
(gyms with equipment and increments) do.

**Model.**

- `gym` table; every user gets "My gym" at first sync. Active gym is a synced preference.
- `gym_equipment` gains `gym_id`; existing rows move to My gym (additive migration).
- `gym_exercise_setting` (gym, exercise): `load_ranges` (JSON `[{min,max,step}]`), `setup_note`.
  The UI shows one range as two fields, "Max load" and "Load step"; multiple ranges (uneven
  dumbbell racks, stacks with a jump) come later in the UI but the schema holds them now.
- Each exercise has a load basis (per hand, per side, total) so a cap or dumbbell max has a
  clear meaning; derive from equipment (dumbbell/kettlebell per hand, plate-loaded per side
  where logged that way, otherwise total).
- Widen the `gym_equipment.kind` check (only `bar`/`plate` today, `tables.ts:412`) in the same
  migration so racks and stacks can be stored later.
- Session gets `gym_id` at start (changeable during the Session); old Sessions stay null = any gym.
- A new gym copies the active gym's kit. The last gym cannot be deleted; deleting another nulls
  `gym_id` on its Sessions and removes its exercise settings. No limit on count.
- The existing per-exercise note stays global ("general note"); the setup note is per gym.

**Hidden while one gym.** Cap, step and setup note look like plain exercise settings; no gym chip
in the Session; Settings shows "Equipment" (today's kit screen) and "Add another gym". The gym
list, the "@ Gym ▾" Session chip and "at <gym>" labels appear only once a second gym exists.
Settings → Gyms then lists gyms; a gym page holds its kit (and equipment from slice 5).

**Caps in progression.**

- Set from exercise settings, from the set-row long-press in a Session, or from a one-time prompt
  ("Is X the max on this machine?") after the user lowers a suggested load to the same value twice.
- Never suggest a load above the cap; at the cap, double progression continues on reps up to an
  extended ceiling of `reps_max × 1.5` (rounded); past it, a quiet "Add a set or try single-arm"
  hint on the exercise (not a modal). Weighted types only. The plate calculator respects it.
- Cap edge rules: if the last load is already above the cap, suggest the cap with a "capped"
  reason; if the next step would overshoot the cap by less than a step, suggest the cap exactly.

**Snap to real loads** (from [gyms-loads-swaps research](../../research/gyms-loads-swaps.md)).

- `incrementFor`, `lightenLoad`, `loadable` and the easy-set doubled increment snap to a load
  grid: the gym's ranges when set, the barbell grid derived from the gym's plates (as
  `warmup-ramp.ts:100` already does), otherwise the equipment default.
- Fix the default dumbbell step: 1 kg up to 10 kg, then 2.5 kg (lb: 2.5, then 5).
- Setup notes stay free text; the editor hint says stack numbers differ between machines.

**Which history drives suggestions.** For machine, cable, Smith and plate-loaded exercises the
progression baseline and ghost values prefer the last Session at the same gym, falling back to
any gym. Free weights use all gyms. Cap and step always come from the active gym.

**Setup notes** show as a chip at the top of the exercise in a Session.

## 4. Phases

Each Program week has a phase. Presets, each editable per Program (sets ×, RPE ±, load %):

| Phase  | Sets                                                            | Effort          | Load   | Progression    |
| ------ | --------------------------------------------------------------- | --------------- | ------ | -------------- |
| Build  | as planned                                                      | as planned      | engine | normal         |
| Push   | as planned                                                      | +1 RPE (−1 RIR) | engine | normal         |
| Test   | accessories ×0.5; main lift one top set (heavy single or AMRAP) | —               | —      | not a baseline |
| Deload | ×0.5, rounded up, min 1                                         | −2 RPE          | ×0.9   | not a baseline |

The main lift is the Workout's first exercise unless changed per Workout.

- Weeks are the Run's calendar weeks (same 7-day blocks as `runWeek`).
- The Program stores a repeating pattern (e.g. 3 Build + 1 Deload) plus optional per-week
  overrides; with no planned length the pattern repeats forever.
- "Insert deload now" makes the current week a Deload and shifts the rest by one week, stored on
  the Run only.
- The 3-stalled-lifts trigger offers "Insert deload week" instead of Lighter week. Existing
  Lighter week preference data stays readable but is no longer created.
- UI: week strip on the Program page under the cover row (chip per week coloured by phase, tap to
  change, "Pattern" to fill); "Week 5 · Deload" chip on the Run hero; one-line Session banner
  ("Deload: sets halved, −10% load"); the Workout preview shows this week's adjusted targets.
- Workouts stay unchanged; phases adjust targets at read time.

Built (slice 4), decisions made while building:

- Storage: `program.phase_plan` (one JSON column: `pattern`, `overrides` by Program week,
  `modifiers` edits, `test_top`), `program_run.inserted_deloads` (JSON array of Run weeks),
  `workout.main_entry_id` (nullable plain reference; simpler than a flag on `workout_exercise`
  because one write moves it and it cannot have two main lifts), `training_session.phase`.
- A Session copies its Workout with the phase already applied (sets, effort, planned loads);
  the Workout's own rows and the position-keyed diff snapshot are untouched. A Test or Deload
  Session never offers to update its Workout.
- Loads in Build and Push stay with the engine. In a Deload the engine suggests the phase's load
  share of the last baseline load, snapped down to the Session gym's grid (`phaseLoad`).
- Effort shifts act on effort targets that exist; a Workout with none shows no change in Push.
- A Test main lift is `top` with 1 rep (heavy single) or `failure` with the planned reps
  (AMRAP), at the heaviest planned load; with no planned load the ghost comes from Previous.
- "Insert deload" on a Program with no plan makes the rest of that Run Build, so it still works.
- The Run's length is the planned weeks plus its inserted Deloads.

Changes after review:

- A Session starts on the unit and the Session gym's load grid: the Session store reads them in
  the starting transaction (the gym, its exercise settings, kit and remembered bars), so the
  Workout preview and the Session that starts from it show the same loads.
- Deload loads (the Workout's targets and the engine's suggestion) snap down to the grid and never
  above the gym's cap; a return from a break keeps its nearest-load rounding.
- A Test week's top set starts from the heaviest completed working set of the exercise's last
  baseline Session (else the Workout's heaviest planned load), held to the gym's cap. A lift with
  no weight (bodyweight reps, reps only) gets an AMRAP set, there being no single to test.
- Stalls: the 14-day break rule reads all training, so a Deload or Test Session between two
  baselines counts as training; only scoring leaves the non-baseline Sessions out. Ghost hints
  derived from Previous skip them too.
- A Session stores `phase_modifiers` (modifiers and Test top at its start); the banner and the
  engine's load factor read it, not the Program's current plan. `phase_plan` is replaced whole by
  a write (last write wins), and its schema strips unknown keys on read and merge.
- Not built: sharing or importing a Program or Workout does not carry `phase_plan` or
  `main_entry_id`; a shared or imported copy starts with no phases and the first exercise as the
  main lift.
- Repair before deploy: `scripts/ops/repair-run-started-at.sh` (see the runbook).

## 5. Gym equipment and swaps

- A gym gains available equipment (tick list of the 13 types, default all) and an optional
  dumbbell max that caps every dumbbell exercise at that gym.
- The swap picker ranks: available at the active gym first, then `primary_detail` overlap, then
  rank. Unavailable exercises are greyed but pickable. No movement-pattern field yet.
- Fix `swapCandidatesQuery` now (in slice 3): drop the different-equipment exclusion, filter to a
  compatible exercise type (no duration alternative for a weighted lift), apply `LIMIT` after the
  final ordering.

## 6. Catalog

Source: the old dataset at `~/Workspace/projects/vermillion/apps/api/src/exercise/data/exercises.jsonl`
(no instructions; write them). Add through a new Catalog patch.

- **Cable Leaning Lateral Raise** (old id 019c5c2e-9543-78c7-b4b9-8693bb3c9736).
- Every gap in [catalog-gaps.md](../../catalog-gaps.md); stretches as duration, Cat-Cow and Open
  Book as reps only. Standing glute squeeze has no old match; author it.
- Strength: neutral-grip lat pulldown, wide neutral-grip pulldown, high-bar squat, low-bar squat,
  cable standing hip extension, half-kneeling Pallof press, half-kneeling cable external rotation,
  Cuban press, pin press, incline Powell raise, Poliquin lateral raise, prone Y raise, prone
  single-arm trap raise, skater squat, Jefferson curl, weighted dead bug, scapula push-up,
  snatch-grip shrug, kneeling leaning one-arm cable row.
- Mobility: World's Greatest Stretch, pigeon and half pigeon, forearm and serratus wall slides,
  thread the needle, across-chest shoulder stretch, kneeling hip flexor stretch.
- New without media (missing from both): Copenhagen plank, reverse Nordic, Spanish squat,
  safety-bar squat, Kelso shrug, Lu raise, Kroc row, Helms row, Spoto press.
- Fix equipment `machine` → `cable` on Lateral Raise (Cable), Single Arm Lateral Raise (Cable),
  Standing Y Raise (Cable).
- Aliases: Tate press, KAS glute bridge, Larsen press, reverse pec deck, Bayesian curl.
- Skip foam rolling. Exercise media licensing (ADR 0034, 0050) stays open before public release.

## 7. Engine review

After slices 1–6, a separate review of the training engine (progression, stalls, phases, caps,
cycle/Run state, ghosts, records, volume) by Codex `gpt-6.2-sol` or `gpt-6.2-astra`, or Claude
Opus, at high effort: bugs, edge cases, missing tests and improvements, written up before fixes.

## 8. Follow-up from the Hevy and Lyfta gap list

Source: [hevy-lyfta-feature-gap.md](../../research/hevy-lyfta-feature-gap.md). Decided by the
agent on 2026-11-24 because the owner was unavailable; the owner may revisit.

Already present, no work: pause workout (workout clock sheet), ±15 s on the rest bar, undo an
import (`undoImportChunk`). The Android widget was removed on purpose and stays removed.

**F1 · Notifications (now, no migration).**

- A Settings → Notifications screen that gathers every reminder: the existing weigh-in and body
  reminders (moved, not duplicated), the training reminder, the report notification and rest
  alerts.
- Training reminder: off by default; weekdays and a time (default weekdays from the setup
  answers if stored). Content "Up next: <Workout>" from the active Run, or "Time to train" with
  no Run. Not sent if a Session was already started that day. Local scheduled notifications,
  rescheduled on app open, Session finish and Run changes. Tapping opens Train.
- Report ready: off by default; on the 1st of the month (and 1 January for the year) at the
  reminder time, only if the previous period had Sessions. Tapping opens that report.
- Rest alerts: a vibration toggle for the rest-end alert and a cue volume (0–100) for the sound
  cues. Settings are synced preferences.

**F2 · Data export (now, no migration).**

- Export body data as CSV: weights and measurements, one file each, same share flow as today.
- A full JSON backup of everything the user owns (plans, Sessions, sets, body data, preferences,
  gyms), versioned, through the share sheet. Restore from JSON is later.

**F3 · Library and units (after slice 3 merges; one migration on `exercise_setting`).**

- Favourite exercises: `favorited_at` on `exercise_setting`; a star on the exercise page and in
  the picker; a Favourites filter chip, and favourites first in the picker when searching empty.
- Body-map muscle filter in the exercise library: tap a muscle region to filter by
  `primary_muscle` (and detail when zoomed).
- Per-exercise unit: `unit` override (kg/lb) on `exercise_setting`; input, display, ghosts,
  load grid and plate calculator use it; history keeps stored units.

**Not now.** Starter Programs (roadmap 1) needs real production-ready plans and its own grilling
session with the owner. Translations, Health Connect, iOS Live Activity stay on the roadmap.

## Deferred

- Machine profiles within one gym (two pec decks at the same gym).
- Run review, and mid-session hold/reduce suggestions (after phases).
- Movement-pattern field for swaps; percentage-of-e1RM top sets.
- From the gyms research: add reps before a load jump over ~10%; seed an editable "Estimated
  from X" ghost on swap from e1RM with equipment ratios (ratios need owner review); machine
  micro-add weights; progression for `bodyweight_assisted_reps` (returns null today); per-gym
  allow/disallow exercise lists; a multi-range editor UI.

## Research in flight

Hevy and Lyfta full feature inventory and gap list: `docs/research/hevy-lyfta-feature-gap.md`.

## 9. Engine round (from the engine review)

Source: [engine-review-2026-11-25.md](../../reports/engine-review-2026-11-25.md). Decisions D1–D11
were put to the owner as Q28–Q40 and taken at the recommended answer under the owner's standing
instruction to proceed while away (2026-11-25); the owner may overturn any of them.

- **Effort (D1):** judged against the set's own effort target; today's 9.5 / 7 thresholds only
  without a target; at most one grind hold in a row at the same load and reps.
- **Stall (D2):** no improvement over three baseline Sessions, where improvement is more load at
  ≥ `reps_min`, more reps at the same load, or e1RM +1%. Later also "suggestion not met three
  times" from the prescription snapshot.
- **Stall deload:** one per stall episode, recorded on the Session, excluded from stall scoring;
  the note stays quiet until the old best is passed or three Sessions go by.
- **Deload rounding (D3):** round down when the real cut stays within about 5 points of the
  intended one, else nearest; always show the real cut.
- **Insert deload (D4):** the inserted Deload replaces the next planned one and the pattern
  restarts after it.
- **Missed weeks (D5):** keep calendar weeks; add Pause Run (paused weeks do not count); skip a
  Test week straight after a break.
- **Test week (D6):** single from e1RM × 0.90–0.95 (RPE 8–9) with optional work-up singles and the
  break factor; the result updates e1RM and Records.
- **Defaults (D7):** seeded fractional plates off; barbell automatic step at least 2.5 kg / 5 lb
  without a gym step; ask a machine's step once (like the max prompt), 2.5 kg / 5 lb until
  answered; kettlebells 4 kg; belt-loaded bodyweight 1.25 kg.
- **Novice baseline (D8):** fixed-rep sets read the latest Session with the same prescription from
  any Workout; ranges keep the same-Workout baseline.
- **Prescription snapshot (D11):** store what was suggested per Session exercise (synced, private).
- **Same-day adjustment (D9):** only on a deviation of 2+ reps or 1.5+ effort on a working set;
  re-suggest unticked sets of that exercise only, with a one-line reason.
- **Overrides (D10):** prompts after the same override twice (step, range, max); never silent drift.
- **Next features (Q40):** a `prescribe()` façade used by every surface; more reps before a jump
  over ~10%; named rules per exercise (Double, Linear, Top set + back-offs, Maintain) with a
  four-Session preview; evidence in every reason; RPE-aware e1RM; assisted and timed progression.
  Later, as their own round: %1RM / training max with AMRAP and waves; readiness question.

Slices: **E1** decision-free fixes (F4, F11, F5, F7, F8, F9, F10, F15, F16, simulation + parity
suites); **E2** decision fixes (F1, F2, F3, F6, F12, F13, F14, Pause Run); **E3** prescription
snapshot, same-day adjustment, override prompts; **E4** `prescribe()` façade and the Q40 features.

**E3 as built.** The step prompt follows the Max and Load step prompts' equipment (machine, cable,
Smith machine): free weights keep the account's increment, which is global, so a lifter who always
adds more than the suggestion on a barbell is not asked. The step prompt is kept per gym and
exercise; the rep-range prompt is kept per Workout exercise, whatever the gym.

Review fixes (owner-delegate decisions, 2026-11-26):

- **Judging a set.** Reps and effort are read only when the set was logged at the suggested load.
  At another load the set is converted to the reps it is worth at the suggested load by estimated
  1RM (Brzycki); a heavier set with fewer reps is not a miss, and a lifter who always adds 5 kg is
  not "missing". With reps and effort both logged and targeted, capacity (reps + 10 − RPE) is
  compared (1.5 or more off moves the sets); with one signal, that one is read (2 reps or 1.5
  effort).
- **Which sets.** Working, top and back-off sets (`progresses(kind)`) trigger, move, count in the
  ledger, the missed-suggestion rule and the override observations. Warm-up, drop, myo and failure
  sets never do. A top set's miss lowers its back-offs. A Lighter week never raises, like a Deload.
- **Undo.** Each adjustment records what it moved, so they undo one at a time (the button stops
  further adjusting). Unticking or correcting the trigger set takes its adjustment back, and any
  made after it, for the sets still unticked, and it may trigger again when ticked.
- **Staying in step.** The snapshot records the Session gym and each set's kind and target. When
  the Session gym moves, a set's kind or target is edited, or a set is added, the Session screen
  gives the unticked sets (all of them for a gym change, the edited ones otherwise) and any set the
  snapshot never covered a fresh suggestion as a revision naming the one it replaces; ticked sets
  keep theirs.
- **Stall.** A Session counts as a missed suggestion only if it also did not improve by the stall
  rule. A stall that comes only from missed suggestions says "Suggestions have been ahead of you
  for three sessions." and offers no lighter-load deload; a real stall still does.
- **Rep range.** Observed over the Session as a whole once every progressing set with a range is
  ticked: most sets above the top, using the lowest of them (14, 15, 14, 15 reads 14); near-equal
  counts (within one rep) across Sessions count together. Answering changes the Workout's
  working, top and back-off sets on exactly the range that was beaten, and says so.
- **Forward compatibility.** A snapshot this build cannot fully read (unknown keys or reasons from a
  newer build) is still shown, but is never adjusted, revised or written over; a snapshot that
  does not parse at all is ignored.

**E4 as built.**

- **`prescribe()`.** One pure entry point (`packages/shared/src/training/engine/prescribe.ts`) takes
  the exercise's place (Workout, gym, grid, phase load, stall flags), its plan, its history, the
  account and the Session's snapshot, and returns the unit, the context the surface reads Previous
  and ghosts from, the stalled-lift verdict and the per-set progression with its evidence. A
  readable snapshot is returned as is. `suggestNext` moved to `engine/pipeline.ts`: eligibility,
  the Test single, the baseline, a reset for a break or Deload, then the exercise's rule.
  `phaseTargets()` is the one way a phase adjusts targets (Session start and the preview);
  `loadExerciseHistory()` is the one way the database surfaces read an exercise's history.
- **Rules (I6).** `exercise_setting.progression_rule` (nullable JSON; null is Double; an unknown
  rule reads as Double). Linear resets after the second miss in a row at a load, by 10% unless the
  rule says otherwise, rounded down onto the grid. Top set and back-offs: back-offs are the rule's
  percent, else the share used last time, else 90%, of today's top load, to the nearest load the
  grid makes; their reps climb within their range. Maintain skips stalls and still takes breaks and
  Deloads. Linear on a lift with no load is Double. The Progression row (exercise page, Session
  exercise menu) opens one sheet with the four rules and what the chosen one asks of the next four
  sessions if every set is made (`previewRule`, the real engine over a made-up history). A rule
  changed mid-Session applies from the next one: sets already shown keep their targets.
- **More reps before a big jump (I4).** At the top of the range, when the next load is more than
  10% heavier (exactly 10% is not), reps climb one a Session to 1.5 times the top, then the load
  jumps. Straight sets wait for each other; an easy set (effort well under its target) takes the
  jump. The extra reps can raise the rep-range prompt after two Sessions.
- **Evidence (I2).** Kept in the snapshot (`evidence`, optional, strict) so every surface reads the
  same lines: "From Nov 24: 60 kg × 12, 12, 11." and, for a break, a Deload or a cap, one more line
  ("Lighter day: the next load down is 10 kg, 20% under.").
- **Effort-aware 1RM (I7).** Reps in reserve (10 minus RPE, at most 4) count as reps, up to 12.
  Records, the stall check, the Test seed and the load conversion that judges a set at another load
  use it; a set judged that way is worth what it was at the same effort. The exercise page shows
  one quiet note, once per device, when logged effort moved a best.
- **Assisted and timed (I8).** Assisted lifts take one grid step of help away once the reps top the
  range (none left: reps keep climbing); a break or Deload keeps the help. A hold that was made at
  its own target adds 5 s, a carry adds a load step (5 m when it carries none), a miss asks for the
  target again; a break cuts a hold in whole fives.
- **Not done here.** The Workout preview's change list shows reps only, so timed work appears in
  the reason sheet and "Next time" but not in that list. Same-day adjustment and the stall check do
  not read time or distance. A Test week with a rule other than Double is unchanged.
