# Audit C: native pre-release (2026-11-27)

Scope: `git diff origin/main...HEAD -- apps/native` on `t3/pre-release-audit-native` (base
`feat/redesign` 87ac951ce; 302 files, +14.5k/−3.4k). Read-only audit; no source changed.

Read first: AGENTS.md, DESIGN.md, `.agents/` ui, data-flow, verticals, i18n, typescript; "Sigil's own
take" in `docs/specs/training/gyms-phases-train-round.md`; `docs/specs/training/navigation-round.md`.

**Coverage.** I read the live Session in full: `session-screen.tsx`, the store and `derive`, set
grid and rows, `exercise-item.tsx`, the gym prompts, the settings sheet and the plate calculator's
links. I also read Train (`train-screen`, `run-hero`, `use-slot-day`, `week-sheet`, `cycle-strip`),
Plan your weeks (screen, strip, strip math), Home (`training-home`, `training-nudges`), reminders
(plan and host), the Android live notification host, the hints, `use-preferences`, swipe rows,
Google sign-in on Android, export naming, and the new delete paths (weigh-in, photo viewer). The
English copy was searched for internal terms.

I sampled only parts of the rest of the diff: exercise detail, History, charts, editor and keypad
internals, and import and share removals. No device run: findings come from reading the code,
and each one names the exact path.

Verdicts: **FIX NOW** before release, **LATER** in a follow-up round, **SKIP** not worth doing.

## Summary

| #   | Sev    | Area            | Finding                                                                         | Verdict          |
| --- | ------ | --------------- | ------------------------------------------------------------------------------- | ---------------- |
| 1   | high   | Session perf    | `onLimits` is not stable: every tick redraws every open set row                 | FIX NOW          |
| 2   | medium | Session / gyms  | Equipment row and plate calculator edit the active gym's kit, not the Session's | FIX NOW          |
| 3   | medium | Notification    | Live notification uses profile bodyweight, not the day's weigh-in               | FIX NOW          |
| 4   | medium | Session perf    | Gym prompts open 2–6 SQLite watches per open exercise and appear late           | LATER            |
| 5   | low    | Session UI      | Max and step questions can show together above the sets                         | FIX NOW          |
| 6   | low    | A11y            | Session gym chip is a ~36 pt target                                             | FIX NOW          |
| 7   | low    | Plan your weeks | Strip opens at week 1, not the current week; locked weeks look tappable         | FIX NOW (scroll) |
| 8   | low    | Copy            | "ghost values" leaks an internal term in Settings                               | FIX NOW          |
| 9   | low    | Session perf    | Screen subscribes to every exercise view only for the phase banner              | LATER            |
| 10  | low    | Hints           | Set-row hint only on the first exercise; grid remounts when it moves            | LATER            |
| 11  | low    | Perf            | Each preferences write re-runs the reminder and live-notification hosts         | LATER            |
| 12  | low    | Exercise perf   | `useExerciseProgression` recomputes the suggestion on every render              | LATER            |

Counts: high 1, medium 3, low 8. FIX NOW 7, LATER 5, SKIP 0.

## Findings

### 1. `onLimits` breaks row memoization in the live Session (high, FIX NOW)

- **Where:** `apps/native/src/session/screen/session-screen.tsx:648-660` (used at `:731` and in
  `kindExtras` at `:624`).
- **Failure:** `onLimits` is a `useCallback` over `foundSets`. `found` is rebuilt whenever
  `session.exercises` changes, which happens on every tick, committed value, added set and Rest
  write. The callback is put directly into the `handlers` object (`:717-762`), so `handlers` gets a
  new identity, and `renderItem` changes with it. Every mounted `ExerciseItem`, `SetGrid`,
  `SetRowItem` and `SetRowView` then gets a new prop and redraws. `HintedSetGrid` also re-wraps its
  handlers. With 6 exercises and 4 open sets each, one tick redraws ~30 memoized components on the
  JS thread while the tick animation and Rest bar start. This undoes the work of the session-editor
  perf round. It came in with the new `onLimits` (set-number sheet, Max load and setup).
- **Fix:** wrap it like the others, `const stableLimits = useStableHandler(onLimits)`, and use
  `stableLimits` in `handlers` and `kindExtras`. Or read `store.getState().found` inside a
  `useCallback([closeKeypad, store])`. Then use the React profiler on a tick to check that only the
  ticked row and the header redraw.

### 2. Session Equipment row and plate calculator ignore the Session's gym (medium, FIX NOW)

This is the known open item. It is a real bug, and it is wider than the Settings row.

- **Where:** `apps/native/src/session/settings/session-settings-sheet.tsx:43-49`;
  `apps/native/src/training/shared/training-preference-rows.tsx:145-162` (label from `activeGym`);
  `apps/native/src/session/plates/plate-calculator-sheet.tsx:270,429` (both push
  `/session/equipment` with no gym); `apps/native/app/session/equipment.tsx` (reads no params).
- **Failure:** take a lifter with two gyms, Home active, who switches this Session to "City" with
  the header chip. The calculator, caps and Ghost values use City's kit (`useGymLoads(sessionGymId)`).
  Settings → "Equipment · Home" opens Home's bars and plates. Tapping "Equipment" or "Missing bar" in
  the calculator also opens Home's kit, because `ManageEquipmentScreen` falls back to `activeGymId`.
  The lifter adds a 1.25 kg pair at "the gym I'm at", and the calculator still cannot make the load.
- **Fix:**
  - `SessionSettingsSheet` takes `gymId` (the Session's `sessionGymId`; pass it from
    `session-screen.tsx:973`).
  - `useTrainingPreferenceRows` takes an optional `equipmentGymId`. It labels the row with that gym's
    name, `nameOf(equipmentGymId ?? activeGymId)`.
  - Both callers push `{ pathname: "/session/equipment", params: { gymId } }` when the Session has a
    gym.
  - `app/session/equipment.tsx` parses `gymId` with zod, as `settings/plates.tsx` does, and passes it
    to `ManageEquipmentScreen`. A Session with `gymId === null` ("Any gym") keeps today's behaviour:
    the gym trained at.

### 3. Live notification builds Ghost values with the profile bodyweight (medium, FIX NOW)

- **Where:** `apps/native/src/session/notifications/workout-live-host.tsx:28,33,71,95`.
- **Failure:** the host passes `preferences.ui.bodyweightKg` into `workoutLiveGhosts`. The screen
  passes `weight.bodyweightOn(session.startedAt)`, the weigh-in of the Session's day with the profile
  value as fallback (`use-session-logging.tsx:48`). Take a bodyweight or weighted-bodyweight
  exercise whose prescription is not captured yet (the first set after adding it while the app is in
  the background, or a notification refresh racing the screen's capture). Done in the notification
  can then capture and tick a different suggestion from the one the screen shows. That breaks the
  comment's promise that "the Done button ticks the value the screen shows". `entries` from
  `useWeight()` is in the effect's dependencies but never read.
- **Fix:** `const { bodyweightOn, loading } = useWeight();`, pass
  `bodyweightKg: session ? bodyweightOn(session.startedAt) : bodyweightKg`, and replace `entries`
  with `bodyweightOn` in the dependencies.

### 4. Gym prompts add SQLite watches per open exercise and appear after it opens (medium, LATER)

- **Where:** `apps/native/src/session/sets/exercise-item.tsx:213-243`;
  `apps/native/src/gym/prompts/override-question.tsx:44`, `step-prompt.tsx:36`, `max-prompt.tsx:61`;
  `apps/native/src/gym/use-gym-setting.ts:12-15`; `apps/native/src/gym/use-gyms.ts:37`.
- **Failure:** each open exercise mounts `OverridePrompt`, which calls `useGymSetting`. That calls
  `useGyms()` (a `watchGyms` watch) and `useGymExerciseSettings()` (a second watch). `StepPrompt`
  and the Max answer each add two more. `useLocalWatch` does not share subscriptions, so three open
  exercises can hold about 12 extra live queries, all re-run on gym-settings writes. Each prompt
  also renders `null` until its watch answers, then pops in. That moves the set rows after the
  accordion has measured the item, which is the jump `useAccordionScroll` tries to avoid.
- **Fix:** the Session store already holds the gym (`inputs.gym.settingFor`, the gym id and name
  from `useGymLoads`). Add a store-backed `useSessionGymSetting(exerciseId)` for reads. Keep one
  `save` at screen level, from the existing `useGymSetting`, passed through `ExerciseHandlers`. Not
  urgent for two users and a handful of open exercises; do it with the next Session perf round.

### 5. Max and step questions can stack above the sets (low, FIX NOW)

- **Where:** `apps/native/src/session/sets/exercise-item.tsx:213-233`;
  `apps/native/src/gym/prompts/step-prompt.tsx:20-40`.
- **Failure:** on a cable or machine exercise at a gym with no step saved, `StepPrompt` shows after
  the first ticked set. If the suggestion was also lowered to the same load in two Sessions,
  `MaxPrompt` shows too. The lifter gets two question cards with four buttons between the header
  and the set they are about to log. "One quiet question" is how `OverridePrompt` already behaves:
  it waits while the max question is open.
- **Fix:** in `StepPrompt`, read
  `usePreference(({ ui }) => pendingCapPrompt(ui.capPrompts, key, sessionId) !== undefined)`, which
  needs `sessionId` passed in, and return `null` while it is true.

### 6. Session gym chip is under 44 pt (low, FIX NOW)

- **Where:** `apps/native/src/gym/session-gym-chip.tsx:39-49`.
- **Failure:** `py-0.5` plus `hitSlop={8}` around a caption line is about 36 pt tall. It sits next to
  the Session title, where a tap during a workout often misses or lands on the header.
- **Fix:** `className="min-h-11 flex-row items-center gap-1 self-start active:opacity-70"`. The text
  size stays the same; only the hit area grows.

### 7. Plan your weeks strip starts at week 1 (low, FIX NOW for the scroll)

- **Where:** `apps/native/src/training/phases/phase-strip.tsx:28-33`.
- **Failure:** an open-ended Program in week 30 draws at least 34 blocks. The horizontal
  `ScrollView` opens at week 1, so the current week (the accent dot) is off screen, and the lifter
  has to scroll to find "now". Trained, inserted-Deload and over-limit weeks are `disabled`, but
  they look the same as editable future weeks. Their reason exists only in the screen-reader hint,
  so a sighted tap does nothing and says nothing.
- **Fix:** add a ref and `onContentSizeChange`, then `scrollTo({ x: max(0, index*(44+6) - width/3) })`
  for the current block (no animation when Reduce Motion is on). Optional, later: draw locked past
  weeks without the pressed state, or use a toast on press of a trained week
  (`phase__trained_hint`).

### 8. "ghost values" in Settings copy (low, FIX NOW)

- **Where:** `packages/i18n/src/locales/en.json`, `settings__previous_hint`: "What the Previous column
  and the ghost values show."
- **Failure:** "Ghost value" is a code and domain term. The set-row hint teaches the same idea as
  "Grey numbers are today's suggestion." The rest of the English copy is clean: no Run, Cycle,
  Slot, baseline, override, modifier or "standalone" in user-visible values.
- **Fix:** "What the Previous column and the grey suggestions show."

### 9. Session screen subscribes to every exercise view for the banner (low, LATER)

- **Where:** `apps/native/src/session/screen/session-screen.tsx:307-329`.
- **Failure:** `useSessionStore((s) => s.views)` makes `LoadedSession`, with its ~20 sheets, menus
  and list header and footer, redraw whenever any exercise's suggestion or rows change. The only
  use is the deload load-cut range in the phase banner. Most of those changes also change
  `session`, which the screen already follows, so the extra cost is small today. It does undercut
  finding 1's fix.
- **Fix:** a selector that returns the banner's inputs, the `loadFactor` list as a joined string
  compared by value, or move the banner into `SessionHeader` with its own selector.

### 10. Set-row hint placement (low, LATER)

- **Where:** `apps/native/src/session/sets/exercise-item.tsx:107,262,372-378`;
  `hinted-set-grid.tsx`.
- **Failure:** the hint is attached to `exerciseIds[0]` only. When a Session is resumed with the
  first exercise done and collapsed, the accordion opens the first unfinished exercise, and the hint
  stays hidden in the closed one. Reordering the first exercise also swaps `HintedSetGrid` and
  `SetGrid`, a different component type. That remounts the grid and drops row enter/exit animation
  state.
- **Fix:** attach the hint to the first expanded, unfinished exercise, from the store. Render
  `HintedSetGrid` always, with a `hinted` boolean, so the component type never changes.

### 11. Every preferences write re-runs the reminder and live-notification hosts (low, LATER)

- **Where:** `apps/native/src/preferences/preferences-store.ts:59-65`;
  `apps/native/src/session/reminders/reminder-host.tsx:183-198`;
  `apps/native/src/session/notifications/workout-live-host.tsx:79-100`.
- **Failure:** `publishPreferences` replaces the whole value without structural sharing, so
  `trainingReminder`, `reportReminder` and `lighterWeeks` get new identities on every save. The new
  cap, step and range bookkeeping (`useLoggedLoad`) and hint dismissals save during a workout. Each
  save re-runs the reminder reconcile, which calls `getAllScheduledNotificationsAsync` and
  re-installs the channel. It also calls `refreshWorkoutLive` again. The Session itself is protected
  by `useStableValue`. Nothing user-visible breaks; this is wasted native calls per progressing tick.
- **Fix:** structural sharing in `publishPreferences`: `replaceEqualDeep(previous, value)` from
  `@tanstack/react-query`, or the store's `deepEqual`. That fixes every reader at once.

### 12. `useExerciseProgression` recomputes every render (low, LATER)

- **Where:** `apps/native/src/exercise/detail/use-exercise-progression.ts:113-140`.
- **Failure:** each render maps the whole history through `withBodyweight` and runs
  `nextExerciseSuggestion`. The detail screen redraws on every sheet toggle and watch emission, and
  the screen is opened over a live Session (`/exercise-view`).
- **Fix:** `useMemo` over `workout`, `history.value`, `gym`, the preference fields and `week`.

## Checked and fine

- **Routes from the Session modal:** View exercise (`/exercise-view`), Warm-ups (`/session/warmups`,
  `/exercise-view/warmups`) and Equipment stay in modal stacks. No tab route is pushed from the
  Session.
- **Sheets:** chained sheets (exercise menu → Note / Exercise settings, set-number sheet → Max load
  and setup, week chip → Deload confirm) close first and open the next after `CLOSE_MS` or two
  frames. `mountOnOpen` keeps the mount-then-open rule.
- **Day boundaries:** reminder planning works in calendar days in the device zone and was checked
  against DST. Home week moves add days to UTC-midnight keys, which is safe. `recordDate` for export
  names uses the device zone.
- **Deload / Undo:** with an active Run they write `inserted_deloads` and check that no counted
  Session falls in that week. Without one they use Lighter week with an Undo toast. Paused Runs and
  Deload weeks hide the offer.
- **Google sign-in on Android:** a cancel or return without a callback makes the button retryable.
  A late callback is still accepted, and there is a 120 s timeout.
- **Deletes:** Delete entry and the photo viewer's delete have Undo or a confirmation. The viewer
  shows one photo, so delete always targets the visible one.
- **Hints:** hidden until preferences are confirmed after first sync, so nothing flashes on a second
  phone. `dismiss` is a no-op once closed. "Got it" is a 44 pt target.
- **Swipe rows:** gesture work stays on the UI thread. React state changes only on the presentation
  edge, and Reduce Motion is honoured via `ReduceMotion.System`.
- **Brand:** day marks follow the ledger (filled, hollow with a slash, accent dot, hairline). The
  week chip, Plan your weeks and the Train card speak in weeks and days.

## FIX NOW batches

Each batch touches its own files, so batches can run in parallel without collisions.

| Batch                           | Findings | Files                                                                                                                                                                                                                        |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Session screen and equipment | 1, 2     | `src/session/screen/session-screen.tsx`, `src/session/settings/session-settings-sheet.tsx`, `src/training/shared/training-preference-rows.tsx`, `src/session/plates/plate-calculator-sheet.tsx`, `app/session/equipment.tsx` |
| B: Live notification            | 3        | `src/session/notifications/workout-live-host.tsx`                                                                                                                                                                            |
| C: Gym prompts and chip         | 5, 6     | `src/gym/prompts/step-prompt.tsx`, `src/session/sets/exercise-item.tsx` (pass `sessionId` to `StepPrompt`), `src/gym/session-gym-chip.tsx`                                                                                   |
| D: Plan your weeks and copy     | 7, 8     | `src/training/phases/phase-strip.tsx`, `packages/i18n/src/locales/en.json`                                                                                                                                                   |

Batch A owns `session-screen.tsx`; batch C owns `exercise-item.tsx`. After each batch, run `pnpm
lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test` and `pnpm i18n:check`. Check findings 1 and 2 on
a device: profile one tick, and switch the gym chip and then open Equipment.
