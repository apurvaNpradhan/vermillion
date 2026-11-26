# Navigation round

Agreed 2026-11-26 in a grilling session (Q1–Q22, every recommendation accepted). Makes Programs,
phases and the live Session easier to find and use, removes duplicated actions, and adds three
once-only hints. Terms follow [CONTEXT.md](../../../CONTEXT.md); voice and brand follow
"Sigil's own take" in [gyms-phases-train-round.md](gyms-phases-train-round.md). Slices run as in
[agent-slices](../../guides/agent-slices.md).

**Rule for the whole round: fix before explaining.** A hint is added only for what the layout
cannot show (gestures, Ghost values). Everything else is fixed in the UI.

## Problem Statement

A Program's phases are spread over five places: the Pattern sheet, the week strip with its own
per-week sheet, four phase rows that each open a modifiers sheet (Test options hidden inside
Test), "Insert deload now", and the planned length in the Details sheet. The UI speaks the code's
words ("Run", "Cycle"), so a user meets Week, Run, Cycle and Phase at once on Train. The same
action appears in several places (Set active, Pause, Share on the Program page; Insert deload on
Program, Train and Home; Resume three times during a workout; Start empty in three places), while
other actions exist only behind a swipe or long press (deleting a weigh-in, set actions, deleting
a photo, program card actions). Lighter week and Deload are two names for one idea. Nothing
explains gestures or Ghost values the first time a user meets them.

## Solution

- The Program page shows cover, status, one **Weeks** row and the Rotation. The Weeks row opens a
  single **Plan your weeks** screen holding length, pattern, the week strip and what each phase
  does.
- The UI speaks in weeks, days and programs: no "Run" or "Cycle" in visible copy.
- One action, **Deload this week**, replaces Insert deload and Lighter week, and can be undone
  until a Session is logged that week. It lives in a sheet behind Train's week chip and in the
  Home stall nudge.
- Every action has one visible home; swipe and long press stay as shortcuts only.
- Three quiet inline hints, each shown once, closed by "Got it" or by doing the thing, replayable
  from Settings.

## User Stories

Program and phases

1. As a lifter, I want a Program page that shows only its cover, whether it is active, its weeks
   and its rotation, so that I can read it at a glance.
2. As a lifter, I want one "Set as active" button on a Program that is not active, so that
   activating is obvious.
3. As a lifter with an active Program, I want a status line "Active · Week 3 of 12", so that I see
   where I am without extra rows.
4. As a lifter, I want Pause, Stop, Share, Duplicate and Delete in the Program's ⋮ menu only, so
   that the page is not cluttered by actions I rarely use.
5. As a lifter, I want a Weeks row on the Program page with a small strip and a summary such as
   "12 weeks · Build ×3, Deload", so that I see the plan's shape before opening it.
6. As a lifter, I want one "Plan your weeks" screen, so that every phase setting is in one place.
7. As a lifter, I want to set the Program's length on that screen, so that the strip and the
   length change together.
8. As a lifter, I want the repeating pattern shown as chips I tap to change, so that I edit it in
   place without a separate sheet.
9. As a lifter, I want a "+ Week" chip and a "Remove week" choice, so that I can lengthen or
   shorten the pattern without a long press.
10. As a lifter, I want to start from a usual pattern, so that I do not build one from nothing.
11. As a lifter, I want to tap one week on the strip and change only that week, so that I can
    move a Test week without changing the pattern.
12. As a lifter, I want to set a changed week back to the pattern, so that a one-off edit is
    reversible.
13. As a lifter, I want to see what Build, Push, Test and Deload each do in one line, and tap one
    to adjust it, so that the effects are visible where I plan.
14. As a lifter, I want Test's top-set and work-up options inside Test, so that they sit with the
    phase they belong to.
15. As a lifter, I want every change to save as I make it, so that I never lose an edit to a
    missing Save tap.
16. As a lifter whose Program has no phases, I want the same screen to show plain Build weeks and
    the usual patterns, so that adding phases is one tap away.
17. As a lifter mid-program, I want a pattern change to apply from now, while weeks I already
    trained keep their phase, so that my history stays true.

Train and deload

18. As a lifter, I want Train to show "Week 3 of 12 · Build" and nothing about cycles, so that I
    think in weeks and days.
19. As a lifter, I want to tap the week chip and see this week's phase and effect, so that I know
    what today asks of me.
20. As a lifter, I want "Deload this week" in that sheet, so that easing off is one deliberate
    tap.
21. As a lifter who deloaded by mistake, I want "Undo deload" until I log a Session that week, so
    that a mis-tap is not permanent.
22. As a lifter, I want "Pause program" and "Plan your weeks" in that sheet, so that the Train
    card has no extra buttons.
23. As a lifter without phases, I want the chip to read "Week 3 of 12" and open the same sheet,
    so that deload and pause work the same way.
24. As a lifter without an active Program, I want "Deload this week" to ease my next seven days,
    so that one name covers both cases.
25. As a lifter, I want the Home stall nudge to say what a deload does ("Fewer sets, lighter
    loads for 7 days"), with a quiet button, so that it informs without competing with Start.
26. As a lifter, I want to skip a day "this time", so that skipping reads in plain words.

Duplicates and hidden actions

27. As a lifter mid-workout, I want one Resume bar, so that the screen does not repeat itself.
28. As a lifter, I want "Start empty workout" as one text link under Start on Home, hidden while a
    workout is open, so that Start stays the one main action.
29. As a lifter, I want to delete a weigh-in or measurement from its edit sheet ("Delete entry"),
    so that I do not need to know a swipe.
30. As a lifter, I want set actions (Fill remaining, Remove, Max load and setup) in the sheet that
    opens when I tap the set number, so that swipe is a shortcut, not the only way.
31. As a lifter, I want a delete button in the full-screen photo viewer, so that I can remove a
    photo without a long press.
32. As a lifter, I want a ⋮ button on Program cards on Train, so that card actions are visible.
33. As a lifter, I want plates, bars and editor sets deletable from their edit forms, so that no
    delete is swipe-only.
34. As a lifter, I want ‹ › arrows on the Home and History week strips, so that changing weeks
    does not depend on a swipe.
35. As a lifter, I want Share in the Session detail header and Edit in its section only, so that
    each action has one home.
36. As a lifter on the Programs screen, I want no "Change" button that reopens the same screen,
    and "New program" as a quiet "+", so that Start is the one main button.

Copy and structure

37. As a lifter, I want "Week 3 · Workout 2" everywhere, so that Home and Programs count the same
    way.
38. As a lifter, I want sentence-case, plain copy ("workout", not "Session"; no "standalone"), so
    that the app reads like the brand.
39. As a lifter, I want the effort column called "Effort", with RPE and RIR named in full in the
    setting, so that the grid needs no glossary.
40. As a lifter, I want "Favourite" for the exercise pin and one name for Max load ("Max load and
    setup"), so that two features do not share a word.
41. As a lifter, I want "Workout settings" without a footnote, so that the sheet says what it is.
42. As a lifter, I want Home, Train and the Active program card to mark days the same way, and
    tapping a day on Home not to hide Start, so that strips mean one thing.
43. As a lifter, I want the Session ⋮ menu short: one Note item, and unit, progression and limits
    in an "Exercise settings" sub-sheet, so that the menu fits on screen.
44. As a lifter, I want one Warm-ups screen that the exercise page and Session link to, so that
    warm-ups are set in one place.
45. As a lifter with two gyms, I want "Equipment · current gym" always in Settings, under one
    name, so that it is never three taps deep.
46. As a lifter, I want empty states to say in one line what a feature is for, so that "No
    programs yet" also tells me what a program is.
47. As a lifter, I want the Muscles button in History to use a muscle icon, so that the header
    icons read correctly.

Hints

48. As a new lifter, I want one note on Plan your weeks explaining what each phase means, so that
    the strip makes sense the first time.
49. As a new lifter, I want one note on the Train strip, "Tap a day to start it or skip it this
    time.", so that the strip's tap is discoverable.
50. As a new lifter, I want one note on the first set row, "Grey numbers are today's suggestion.
    Tick the set to log them. Tap the set number for more.", so that Ghost values and set actions
    are clear.
51. As a lifter, I want a hint to close on "Got it" or the first time I do what it describes, so
    that it never nags.
52. As a lifter on a second phone, I want hints I closed to stay closed, so that I am not taught
    twice.
53. As a lifter, I want "Show tips again" in Settings, so that I can replay them.
54. As an existing user, I want to see each hint once too, so that I learn the new layout.

## Implementation Decisions

- **Vocabulary.** CONTEXT.md keeps Run, Cycle, Slot and Phase plan as code and domain terms and
  gains a "UI wording" note: the UI says program, week, day, "this time", "Plan your weeks",
  "Deload this week". Lighter week stays a domain term for the no-Run deload.
- **Plan your weeks** is a new route under the Program (`…/program/[id]/weeks`). It reads and
  writes the existing Phase plan (`phase_plan`) and the Program's `planned_weeks` through the
  existing Program actions; no schema change. The Pattern sheet and the per-week sheet are
  replaced; the modifiers sheet stays and opens from the phase rows on the new screen. Planned
  length leaves the Details sheet.
- **Program page** keeps the cover row (opens Details: name, cover, description, sessions per
  week), the status line or "Set as active" button, the Weeks row, the description and the
  Rotation. The header share icon goes; the ⋮ menu holds Pause/Resume, Stop, Share, Duplicate,
  Delete. `PhaseSection` leaves the Program page.
- **Week chip sheet** on Train replaces the RunHero's "Cycle N" label, its "Insert deload now"
  link and its full-width Pause button. Contents: phase name and effect line (when a Phase plan
  exists), Deload this week or Undo deload, Pause program / Resume program, Plan your weeks.
- **Deload this week.** With an active Run it calls the existing Inserted deload logic. Without
  one it starts a Lighter week (existing `startLighterWeek`). The Program page no longer offers
  it.
- **Undo deload.** A new pure function in `packages/shared` phases decides eligibility: the
  current Run week is an inserted Deload and no counted Session of the Run was started as a
  Deload in that week (a Build Session logged earlier the same week does not block it).
  Undo removes that week from the Run's `inserted_deloads` (existing synced column; the
  pattern-restart effect is recomputed). Without a Run, undo ends the Lighter week if no Session
  was logged since it started (existing "end early" path). The server and sync paths already
  accept Run updates; confirm the upload handler validates a shrinking `inserted_deloads`.
- **Hints.** One `Hint` component in `apps/native/src/platform/ui` (inline note: body text,
  "Got it"), driven by a `useHint(id)` hook over the existing synced `ui.dismissedHints`
  preference (no schema change). `useHint` returns `visible` and `dismiss`; the screen calls
  `dismiss` when the user performs the described action (first swipe, first strip tap, first edit
  on Plan your weeks). Hint ids: `plan-weeks`, `train-strip`, `set-row`. "Show tips again" in
  Settings clears the three ids. Panel UI Tour is not used.
- **Set number sheet** (the sheet opened by tapping the set badge) gains Fill remaining, Remove
  and Max load and setup; long press on the badge goes.
- **EmptyState** gains an optional `description` line.
- **Day marks.** One mark set shared by the Home week strip, the Train cycle strip and the Active
  program card, following the ledger marks in "Sigil's own take" (done filled, skipped hollow with
  slash, next ember dot, rest hairline).
- **Session ⋮ menu**: Note and Pin a note merge into Note; unit, progression and limits move into
  an "Exercise settings" sub-sheet.
- **Warm-ups**: one screen (today's Settings warm-up calculator plus "Count warm-up sets"); the
  exercise page's auto warm-ups row and the Session's "Add warm-ups" link to it.
- **Week counting**: "Week N · Workout M" everywhere; Home stops counting rest days.

## Testing Decisions

- Tests check behaviour through public functions, not component internals; our own modules are
  not mocked ([testing](../../../.agents/testing.md)).
- **Seam 1, pure functions in `packages/shared`** (prior art: `phase-strip-math.test.ts`,
  phases tests, `lighter-week` tests): undo-deload eligibility and its effect on the phase of each
  week; the Weeks row summary text input (pattern + length → summary parts); week counting
  "Week N · Workout M" without rest days; day-mark state mapping shared by the three strips;
  hint visibility from `dismissedHints`.
- **Seam 2, sync and API in-process** ([orpc-testing](../../../.agents/orpc-testing.md)): a Run
  update that removes an inserted deload is accepted for the owner and rejected for another user,
  only if the existing handler does not already cover it.
- No component render tests; UI is checked on the phone. `pnpm i18n:check` guards every new and
  renamed string, and removed keys are deleted.

## Slices

1. **Wording and duplicates**: Run/Cycle copy, Program page de-duplication, week chip sheet,
   Deload this week + undo, Lighter week merge, Home nudge line, Q20 copy fixes (stories 2–4,
   18–28, 35–41).
2. **Plan your weeks** (stories 5–17).
3. **Hints** (stories 48–54).
4. **Hidden actions and structure**: stories 29–34, 42–47.

Slices run one after another (they share `en.json` and Program/Train screens); Codex reviews and
fixes slice N while Sonnet builds slice N+1.

## Out of Scope

- %TM, waves and readiness (parked grill, [percent-waves-readiness](../../research/percent-waves-readiness.md)).
- Tab bar labels, History header layout (only the Muscles icon changes), volume shown in tonnes,
  long presses that already have a visible alternative.
- Spotlight tours or any tour library.
- A hint for gym limits; the in-Session max and step prompts already teach them.

## Further Notes

- The owner and the owner's brother use the app in production; existing accounts see each hint
  once.
- Pre-deploy items from the previous round still apply (repair script, catalog 0004 media, API
  before app).
