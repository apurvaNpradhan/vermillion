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

| Phase  | Sets                                                                   | Effort           | Load          | Progression          |
| ------ | ---------------------------------------------------------------------- | ---------------- | ------------- | -------------------- |
| Build  | as planned                                                             | as planned       | engine        | normal               |
| Push   | as planned                                                             | +1 RPE (−1 RIR)  | engine        | normal               |
| Test   | accessories ×0.5; main lift one top set (heavy single or AMRAP)        | —                | —             | not a baseline       |
| Deload | ×0.5, rounded up, min 1                                                | −2 RPE           | ×0.9          | not a baseline       |

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
