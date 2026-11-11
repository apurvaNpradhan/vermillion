# Native screen review, 11 November 2026

Task H. Written review only. No application code changes or device interaction.

## Scope and evidence

Read AGENTS.md, CONTEXT.md, .agents/ui.md, ADRs 0036–0038, training and session slice plans,
and the existing native QA report. The latest ADR amendments take precedence over older slice
mockups. Preserve pick-first creation, one expanded exercise, explicit plan updates, independent
session snapshots, advisory Rest slots and flexible rotation order. Do not introduce an overdue
calendar, shared workouts across programs, or automatic progression.

This review describes the checked-out source on 2026-11-11. File references are repository-relative;
line numbers can move as concurrent agents edit. Findings are code observations or UX risks, not
claims of reproduced device bugs. The earlier QA report records Motorola dark-theme testing;
this review does not establish measured contrast, screen-reader behavior or large-text fit.

Excluded from proposals because other agents own them: speed/staggered loading, offline toasts
and pill, new Top/Back-off/Myo kinds, completed-row green and swipe-only reveal, exercise detail
from a session, rest-end chime, and plate-calculator rebuilding. Existing QA fixes such as History
Back, preview Edit, discard confirmation and Previous retry are acknowledged, not proposed again.

Effort: S = local copy/layout/semantics change; M = interaction across components/hooks;
L = substantial new flow or data behavior. Impact: H = repeated logging or data-confidence benefit;
M = planning/navigation benefit; L = occasional polish. These are estimates, not delivery promises.

## Benchmark patterns

First-party references checked for this review:

- [Hevy logging](https://www.hevyapp.com/features/track-workouts/) and
  [Previous versus routine values](https://help.hevyapp.com/hc/en-us/articles/34105442929943-Previous-Workout-Values-Vs-Routine-Values-How-to-Adjust-in-Settings)
  distinguish prior performance from planned values. Apply that distinction visibly; keep
  Vermillion's any-workout matching rule rather than adding a preference here.
- [Strong logging help](https://help.strongapp.io/category/165-logging-a-workout) separates logging,
  timers and explicit template updates. The useful pattern is a clear boundary between recording
  today and changing the future plan.
- [Liftin'](https://liftinapp.co/) presents the day's exercise list and set entry as the main gym
  task. Borrow its focus on readable, low-effort logging rather than extra dashboard controls.
- [Alpha Progression](https://alphaprogression.com/) emphasizes stable plans and progress within
  them. Borrow plan context and understandable history; automated coaching remains deferred here.

These sources support broad patterns, not a current tap-by-tap competitive audit. Proposed
layouts and priorities below are this review's judgments. Do not copy branding or competitors'
terminology: Vermillion distinguishes Program, Workout and Session.

## Train tab and Home

### Train library, train-screen.tsx

A lifter wants to pick today's saved workout, resume training, or create a plan. The unified
Programs preview and compact Workout rows match the latest ADR and should stay. Create currently
mixes plan creation with starting a live session, while both empty states only supply a title.
The primary action sits in the header, away from the empty-state explanation.

- **TR-1 · Give empty states an immediate next action.** Problem:
  `apps/native/src/training/components/train-screen.tsx:156` renders title-only empty states;
  creation requires the header Create menu at line 96 and then a choice at line 54.
  Proposal: put "Build a workout" beside a short explanation in the all-empty body; offer a quiet
  "Start without a plan" action. In the workouts-empty/programs-present state say "Standalone
  workouts appear here. Your program's workouts are inside its program" and link to creation.
  Keep the single header Create action on populated lists. Effort S, impact H.
- **TR-2 · Separate starting now from building for later in Create.** Problem:
  `apps/native/src/training/components/train-screen.tsx:52` lists new Workout, new Program and
  empty Session without explaining their different outcomes. Proposal: label the session choice
  "Start without a plan" and add descriptions to the three choices, such as "Save exercises and
  targets for reuse" and "Arrange workouts into a rotation". Preserve product nouns elsewhere.
  Effort S, impact M.

### Home dashboard, training-home.tsx and home-screen.tsx

A lifter wants to continue or start training and briefly assess recent consistency. Home has a
useful first-session action, recent sessions, and hidden empty statistics. It also repeats the
full active-program management card from Train. A returning lifter without an active program
gets recent history but no comparable start action in this component.

- **TR-3 · Keep a training action visible for returning lifters.** Problem:
  `apps/native/src/training/components/training-home.tsx:54` restricts the standalone start action
  to accounts with no history; line 104 then offers only history for a returning non-program user.
  Proposal: add "Choose workout" linking to Train and a quiet "Start without a plan" in this
  state. Let the existing global Resume bar remain the primary continuation control during an
  active session. Check its reach and overlap with the Home content rather than duplicating it.
  Effort S, impact H.
- **TR-4 · Explain the weekly comparison and chart units.** Problem:
  `apps/native/src/training/components/training-home.tsx:70` subtracts the whole previous week
  from the current incomplete week, and line 90 passes a unitless formatter to the volume chart.
  Proposal: state "This week so far vs last full week"; label the chart "Weekly volume · kg/lb".
  Explain counted sets and missing-bodyweight limitations from a small stats help action. Keep
  signed neutral deltas rather than implying that more volume is always better. Effort S, impact M.
- **TR-5 · Reduce repeated program management on Home.** Problem:
  `apps/native/src/training/components/training-home.tsx:45` reuses the entire Train card;
  `apps/native/src/training/components/home-screen.tsx:11` adds a potentially long personalized
  title above it. Proposal: Home gets a compact Next up block with program context, preview and
  Start; Train retains Change, full cycle explanation and run management. Allow the greeting to
  wrap at large text without pushing the training action out of the first viewport. Effort M,
  impact M.

### Active program card and hooks

A lifter wants to understand what is next and how far through the rotation they are. Current
single-letter dots are hard to distinguish for Upper A/Upper B or repeated workouts. Rest dots
have an accessible state but no visible explanation. The hook's absent program and failed detail
can both result in no card; that uncertainty is different from having no active program.

- **TR-6 · Make rotation progress readable and inspectable.** Problem:
  `apps/native/src/training/components/active-program-card.tsx:57` shows an unlabeled dot row;
  line 90 reduces each workout to its first letter. Proposal: show "Cycle 2 · 3 of 5 workouts"
  and numbered markers, with a quiet "View rotation" action opening the Program. Include a brief
  explanation that Rest is advisory and workouts can be done out of order. Exclude Rest from the
  completion denominator. Announce cycle, slot number, title and state together. Effort M, impact H.
- **TR-7 · Distinguish no active program from unavailable program data.** Problem:
  `apps/native/src/training/use-active-program.ts:29` maps all non-ready detail states to null,
  and `apps/native/src/training/components/active-program-card.tsx:38` silently returns null.
  Proposal: expose an explicit failed state with "Couldn't read your active program" and Retry;
  if its plan was deleted, explain that and link to Programs. Keep the rest of Home/Train usable.
  This is recovery copy/state semantics, not a loading-speed proposal. Effort M, impact M.
- **TR-8 · Explain the three end-of-run choices before applying them.** Problem:
  `apps/native/src/training/components/active-program-card.tsx:107` offers Finish, Keep going
  and Run again as immediate actions with no outcome text. Proposal: add descriptions explaining
  that Finish records completion, Keep going retains this Run, and Run again starts a new Run
  while preserving history. Name the program and elapsed/planned weeks. Show write failure in
  the decision context so the lifter knows whether the Run changed. Effort M, impact M.

State/accessibility/theme acceptance: keep existing loading and first-sync distinctions; do not
turn failed reads into empty collections. Test long names and 200% text with header Create and
Change. Use semantic foreground/muted/surface roles in both themes; dots need labels and shapes,
not just opacity. Keep the filled neutral action focused on Start where present.

## Programs

### Program library, programs-screen.tsx and program-row.tsx

A lifter wants to find a split, identify the active plan and compare its size before opening it.
The compact grouped rows, explicit menus and cover fallback are good foundations. List rows do
not visibly identify the active program, and every menu has the same accessible name.

- **PG-1 · Show program status in the library.** Problem:
  `apps/native/src/training/components/program-row.tsx:67` reads the active Run but only uses it
  for menu actions at line 74; the visible row at line 99 has only title and size metadata.
  Proposal: show an "Active" text badge and concise current-week context. A future Completed
  label should be derived from the last Run, not inferred from planned weeks. Keep the active
  program easy to find without changing user ordering unexpectedly. Effort M, impact M.
- **PG-2 · Add library finding and empty-state guidance.** Problem:
  `apps/native/src/training/components/programs-screen.tsx:59` displays the entire collection
  without search, and line 73 supplies only a no-programs title. Proposal: show search when the
  collection grows beyond a small screenful; retain the query after Back. Give the empty body
  "Create a program" and explain that a program groups workouts into a repeatable order. Do not
  introduce folders or a public catalog for a limit of 100 personal plans. Effort M, impact M.

### Program overview, program-screen.tsx

A lifter wants to inspect the split, train a chosen day, or change the rotation. Metadata editing
is prominent, but current cycle progress is absent from the rotation. Error and missing states
have different text but neither provides an in-body recovery action. Empty and all-Rest programs
can expose Set active despite having no workout to start.

- **PG-3 · Make preview and edit destinations match their labels.** Problem:
  `apps/native/src/training/components/program-screen.tsx:193` labels a slot action "Edit workout",
  but `apps/native/app/(app)/train/program/[id].tsx:14` routes it to `/train/workout/[id]`, which
  renders the preview. Proposal: row tap keeps the read-first preview; the explicit Edit action
  goes directly to `/edit`. Rename the callback contract to distinguish those destinations.
  Show the parent program in preview/editor so Back and ownership remain clear. Effort S, impact H.
- **PG-4 · Put active rotation state beside its workouts.** Problem:
  `apps/native/src/training/components/program-screen.tsx:259` exposes Stop/Set active, while
  lines 292–300 pass no trained/next-up state to RotationRow. Proposal: for the active program
  show cycle count, Next up and textual Done/Not yet states on the appropriate numbered slots.
  Offer Start via the selected preview, preserving out-of-order training. For no workout slots,
  replace activation with "Add a workout to use this program". Explain the 28-slot limit beside
  the disabled Add day action at line 279. Effort M, impact H.
- **PG-5 · Recover from program reads without leaving the flow.** Problem:
  `apps/native/src/training/components/program-screen.tsx:81` ends failed/missing reads with an
  EmptyState alone. Proposal: failure offers Retry and Back; missing offers "Back to programs"
  with copy that a removed program's sessions remain in History. Do not suggest recreating it
  after a transient local read failure. Effort S, impact M.

### Program details, program-details-screen.tsx

A lifter wants to set a name, optional length, description and cover without losing changes.
The explicit local-only photo note is honest and should stay. Choosing a typical eight- or
12-week length from Off currently needs repeated increments. The form autosaves, yet no state
near the form explains that.

- **PG-6 · Make planned length direct and autosave understandable.** Problem:
  `apps/native/src/training/components/program-details-screen.tsx:86` increments one week at a
  time; line 127 supplies only the stepper. Proposal: retain accessible increment/decrement but
  let the value open direct numeric entry with common 4/8/12-week choices and Open-ended. Label
  it "Planned length" with "Starts with your first session"; explain that it does not schedule
  days. Add a local-save status and actionable failed-write message near edited fields. Closing
  remains Done, not Cancel, because edits already apply. Effort M, impact M.

### New program, new-program-screen.tsx

A lifter wants to make a named container and immediately build its first day. Title-only creation
is appropriately small; do not add goals, experience level or mandatory schedule questions.

- **PG-7 · Set expectations for the next step.** Problem:
  `apps/native/src/training/components/new-program-screen.tsx:37` has a name field and generic
  Create button with no description of what follows; busy at line 25 only disables the button.
  Proposal: add "Next, add workouts and rest days" and use "Create program". During the write,
  show "Creating program…" with a busy announcement; keep the title after failure. Focus Add day
  or its guidance on the resulting empty program screen. Effort S, impact M.

### Rotation rows, rotation-row.tsx

A lifter wants to see workout order and know whether editing one repeated slot changes another.
Numbered slots and distinct Rest rows help. The ×2 badge says frequency, but shared identity
still requires remembering an explanation from the reuse picker.

- **PG-8 · Explain shared repeated slots where edits happen.** Problem:
  `apps/native/src/training/components/rotation-row.tsx:152` shows only a repeat multiplier, and
  `apps/native/src/training/components/program-screen.tsx:193` offers editing without scope text.
  Proposal: label repeat metadata "Used in 2 slots"; in the slot menu name the affected slot
  numbers and explain "Editing updates both". Keep "Duplicate as new workout" as the explicit
  way to vary one slot. Retain copying when crossing program ownership. Effort S, impact H.

For all program screens, allow title and metadata wrapping before shrinking controls. Keep menu
and grip hit regions distinct. Expose reorder alternatives through accessible actions or menu
Move up/Move down, and test focus after moving a slot. Rest is advisory, never a blocking overdue
item. Use text and surface steps for active/done state in both themes; keep the existing cover
fallback and local-photo explanation. Skeletons exist on detail reads; improve recovery rather
than introducing new loading choreography.

## Workouts

### Workout creation and editor, workout-editor.tsx

A lifter wants to pick exercises, set targets, reorder and finish planning. The accordion avoids
a long wall of grids and should stay. Creation currently leads to the read-first preview, so
adjusting freshly selected defaults requires an extra Edit action. The editor also uses generic
Show more copy for note and muscle coverage, and its failed-read body has no Retry.

- **WO-1 · Send newly created workouts straight to editing.** Problem:
  `apps/native/src/training/use-start-workout.ts:28` navigates to the preview route after the
  picker; `apps/native/app/(app)/train/workout/[id].tsx:7` confirms that destination. Proposal:
  successful creation opens `/edit`, with the first exercise expanded. Existing workout taps
  keep opening preview. This removes one avoidable action every time a lifter builds a workout.
  Effort S, impact H.
- **WO-2 · Name the editor's disclosure and save behavior.** Problem:
  `apps/native/src/training/components/workout-editor.tsx:328` labels note/muscle coverage as
  Show more, and line 315 uses Done to close already-saved detail fields. Proposal: name the
  disclosure "Workout note and muscles" and show a brief "Changes save automatically" cue on
  first use. Surface failed local saves near the edited item with Retry; do not imply that Done
  commits a draft. Keep title/note editing in Edit details as the ADR specifies. Effort S, impact M.
- **WO-3 · Give editor read errors a useful exit and retry.** Problem:
  `apps/native/src/training/components/workout-editor.tsx:81` presents the same inert layout
  for missing and failed reads. Proposal: failed reads offer Retry; deleted workouts offer Back
  to Train with "Your previous sessions are still in History". Keep the snapshot/history model
  clear instead of suggesting data loss. Effort S, impact M.

### Workout preview, workout-preview-screen.tsx

A lifter wants to check today's exercises and expected work, then Start. Last done, direct Edit
and planned/previous summaries already exist. A chart above every exercise increases the distance
to the plan. Unnamed workouts lose their muscle-derived identity in the preview header.

- **WO-4 · Put the workout plan before the progress chart.** Problem:
  `apps/native/src/training/components/workout-preview-screen.tsx:114` renders the chart before
  exercise summaries at line 147. Proposal: lead with exercise count, estimated duration, Start,
  note and the exercises; put the existing chart under a "Progress" disclosure. Keep a Start
  control reachable at the bottom after inspection, using a sticky action only if it clears
  navigation and safe areas. Do not add another filled action in the same viewport. Effort M,
  impact H.
- **WO-5 · Preserve identity and explain Previous provenance.** Problem:
  `apps/native/src/training/components/workout-preview-screen.tsx:65` falls back to "Workout"
  instead of the derived title used in lists/editor; line 149 reads any-workout exercise history
  while line 96 reports last completion of this particular Workout. Proposal: share the derived
  display name across list, preview, editor and source links. Label summaries "Planned" and
  "Previous · [date]"; explain once that Previous can come from another workout. Add short
  no-history copy only when the read succeeds with no result. Effort M, impact H.

### Exercise row, workout-exercise-row.tsx

A lifter wants to scan targets, open one exercise and understand superset membership. The existing
summary, pinned note, group bracket and distinct menu are useful. One-line exercise titles can
hide the only word distinguishing similar movements, and the planning row lacks the session
row's expanded accessibility state.

- **WO-6 · Make expansion and exercise identity unambiguous.** Problem:
  `apps/native/src/training/components/workout-exercise-row.tsx:104` has an expansion action
  without expanded state, and line 118 limits the name to one line. Proposal: add expanded
  semantics and a small disclosure indicator outside the target cells; allow two title lines.
  On expanding a row, keep its title and first target visible above the keyboard. Give reorder
  handles accessible Move up/Move down alternatives shared with rotation/session rows. Effort M,
  impact M.

### Planned set table, set-table.tsx

A lifter wants to enter exact loads, rep ranges and optional effort without corrupting targets.
A row represents one set consistently, as required by the final ADR amendment. Do not restore
an implicit All sets alike mode. Fixed badge width, an always-present effort column for rep
exercises, one-line headers and 40-point inputs compete for a narrow screen.

- **WO-7 · Make target entry fit small screens and large text.** Problem:
  `apps/native/src/training/components/set-table.tsx:39` always adds effort alongside reps;
  line 104 truncates headers, and `apps/native/src/training/components/cell-input.tsx:59` fixes
  input height at 40. Proposal: keep weight/reps and set identity primary; offer an explicit
  "Add effort targets" control when effort is unused. At large text, use a labelled secondary
  row for optional fields instead of squeezing all columns. Maintain at least 44-point iOS /
  48-dp Android touch areas, without overlapping neighbors. Effort M, impact H.
- **WO-8 · Explain rejected numeric input instead of silently reverting it.** Problem:
  `apps/native/src/training/components/cell-input.tsx:54` ignores unparseable edits, and line 33
  restores the stored value after blur. The duration cell at
  `apps/native/src/training/components/set-table.tsx:174` uses this number-pad control with a
  `0:00` format, making format entry harder on some keyboards. Proposal: show field-specific
  errors for a completed invalid entry and retain it for correction. Use a duration control with
  minutes/seconds or clear numeric-seconds entry. Explain that blank optional load means no
  planned load, while zero is a value where the exercise type allows it. Effort M, impact H.

### Target sheets, inline-targets.tsx, detailed-targets.tsx and targets controls

A lifter wants to change one set's rep or effort target and the exercise's rest. Sharing the same
DetailedTargets implementation in inline/detail views is the right consistency choice. Exact
reps/Rep range already has validation and explicit modes; keep those. More context is needed
when a sheet opens over a dense workout or a superset hides its rest control.

- **WO-9 · Carry set context into target sheets.** Problem:
  `apps/native/src/training/components/rep-target.tsx:54` uses the generic Rep target title;
  `apps/native/src/training/components/detailed-targets.tsx:70` names only the effort scale.
  Proposal: show exercise title and set number in the sheet heading, including the existing kind.
  Keep selected range, Done and error visible above the keyboard. Give RPE/RIR a short explanation
  with a concrete example and an optional None action; do not require effort. Effort S, impact M.
- **WO-10 · Explain where superset rest is edited.** Problem:
  `apps/native/src/training/components/inline-targets.tsx:48` hides rest for first/middle members.
  Proposal: show a quiet "Rest after [last exercise]" link that reveals the group's rest control.
  In that control label it "Rest after the round". Keep the single stored rest on the last member,
  and keep the current duration presets and Off. Effort S, impact M.

### Shared plan rows, plan-row.tsx

A lifter wants to open a workout/program or use its menu without an accidental action. Shared
row typography, a large main target and visible overflow affordance are already consistent.

- **WO-11 · Name each overflow menu and its destination.** Problem:
  `apps/native/src/training/components/plan-row.tsx:55` announces only a generic menuLabel;
  many consecutive rows therefore expose identical "Workout menu" or "Program menu" buttons.
  Proposal: announce "Actions for [title]" and give the main row a concise "Open workout preview"
  or "Open program" hint. Include Active status in the accessible label once PG-1 lands. Keep
  swipe and overflow choices equivalent; this proposal does not change swipe behavior. Effort S,
  impact M.

Workout-state/theme acceptance: show missing versus failed plan reads separately; preserve
planned versus previous meaning when history is absent or failed. Test weight/reps, assisted,
bodyweight, timed and distance types in both units and effort scales. Inspect muted targets,
input boundaries, focus and kind badges in both themes. Do not rely on color alone. No measured
contrast failure is asserted here. Verify keyboard avoidance and focus restoration after each
sheet on Android and iOS with large text.

## Live session and session records

### Logging screen, session-screen.tsx

A lifter wants to log the set just performed, adapt to occupied equipment and preserve a correct
record. The accordion, automatic advance, Previous retry, explicit ownership banner, minimize,
and confirmed discard already support this. A finished session opens the same screen for edits;
those set edits happen directly, which is easy to confuse with a cancellable edit form.

- **SE-1 · Make historical editing explicit.** Problem:
  `apps/native/src/session/components/session-screen.tsx:408` changes the header based on
  finishedAt but provides no visible "Editing past session" explanation; direct cell edits still
  use the action hooks. Proposal: show a quiet dated editing banner explaining that set changes
  save as entered and affect history/records. Use "Done editing" for the completion action. Keep
  timers and tick controls absent as they already are for finished sessions. Effort S, impact H.
- **SE-2 · Give session errors an explicit escape route.** Problem:
  `apps/native/src/session/components/session-screen.tsx:104` renders Retry but no minimize/back
  control, while a missing session at line 92 exits automatically. Proposal: provide "Back to
  training" beside Retry; after a missing/deleted session exits, explain why. Do not call a
  finished history edit "discarded" on read failure. Preserve the existing ownership safeguards
  and test that focus moves to the ownership banner after takeover elsewhere. Effort S, impact M.

### Session header, session-header.tsx

A lifter wants to see elapsed time and finish without losing their place. The persistent Finish
button is discoverable; totals and title compete with three separate controls across one row.

- **SE-3 · Let header statistics wrap before titles disappear.** Problem:
  `apps/native/src/session/components/session-header.tsx:66` puts a single-line title and
  single-line stats between minimize, menu and Finish; line 76 also leaves a separator when the
  finished clock is absent. Proposal: keep minimize/Finish stable and thumb-sized, put elapsed
  time with a short counted-set total below the title, and move volume to a second line when
  needed. Remove orphan separators in edit mode. Make the full title accessible, label counted
  sets clearly, and keep the updating clock out of live announcements. Effort M, impact H.

### Session exercise rows, exercise-row.tsx

A lifter wants to know which exercise/set is next while optionally training out of order. The
expanded state is correctly exposed, and the bracket identifies supersets. Completed summaries
are single-line, and the Add set shortcut disappears with the just-finished exercise's rest.

- **SE-4 · Make the next set clear without hiding manual choice.** Problem:
  `apps/native/src/session/components/exercise-row.tsx:106` compresses progress and completed
  actuals to one line; `apps/native/src/session/components/session-screen.tsx:474` ties the
  collapsed Add set shortcut to running rest. Proposal: show progress as "2 of 4 sets" and add
  round/member text for supersets, such as "Round 2 · Row next". Preserve any-row expansion and
  the existing post-collapse shortcut; opening a completed row should clearly expose Add set
  even after rest ends. Allow two lines for movement names. On auto-advance announce the next
  exercise/set once, without moving screen-reader focus away from an unfinished edit. Effort M,
  impact H.

### Live set grid, set-grid.tsx

A lifter wants to compare Previous, enter actuals and tick with one hand. It is the app's most
frequently used area. The current horizontal layout allocates space to a badge, Previous, type
fields, effort and completion. Timed-distance exercises add another control inside a value cell.

- **SE-5 · Protect actual entry and completion space.** Problem:
  `apps/native/src/session/components/set-grid.tsx:77` lays every column on one line, including
  fixed widths for badge, effort and tick. Proposal: keep numeric actuals and completion in stable
  columns; on narrow or large-text layouts move Previous to a labelled secondary line for that
  set. Optional effort can use the same secondary area. Keep Previous tap-to-copy, but avoid
  truncated values such as "100 kg ×…". Include the active exercise, set number and field/unit
  above the keypad so orientation survives scrolling. Effort M, impact H.

### Live set row and cells, set-row.tsx

A lifter wants to record what happened, including "same as last time", with confidence about
what has been saved. Ghosts and ticking already support one-tap logging, while refused ticks
shake and outline the missing cells. Color/motion alone does not explain what to correct.

- **SE-6 · Explain suggestions and failed ticks in words.** Problem:
  `apps/native/src/session/components/set-cell.tsx:67` announces a ghost as the value without
  saying it is suggested; line 61 represents refusal only through border and motion. Proposal:
  announce "Suggested 60 kilograms, not entered" versus an actual entered value. A first-use
  hint should say "Tick uses the suggested values; tap a value to change it". After refusal show
  and announce "Enter distance for set 2" and focus that cell on explicit user request. Preserve
  the rule that incomplete required values never produce a completed set. Effort M, impact H.
- **SE-7 · Distinguish duration countdown from stopwatch.** Problem:
  `apps/native/src/session/components/set-row.tsx:155` uses a Play/Stop icon for both modes;
  accessibility strings distinguish them, but sighted users see no comparable explanation.
  Proposal: show "Start 0:30 timer" for a targeted duration or "Start stopwatch" otherwise;
  while running say whether Stop logs elapsed time or Cancel stops the countdown. Enlarge the
  current 36-point-wide control at line 170 and keep typed duration available. Effort S, impact M.

### Rest bar, rest-bar.tsx

A lifter wants to know how long until the next set and adjust it without leaving logging. The
bottom placement, explicit −15/+15/Skip, progress line and quiet live-region behavior are useful.
The bar has only generic Rest context even after auto-advance opens a different exercise.

- **SE-8 · Attach rest to the set that started it.** Problem:
  `apps/native/src/session/components/rest-bar.tsx:27` receives only setId/timestamps, and line 73
  displays only Rest. Proposal: add a short "After Bench · set 3" or "After superset round 2"
  label. Expose remaining time as a readable accessibility value, with announcements only on
  explicit adjustment or completion. At large text allow controls to wrap without pushing
  actual entry behind the keypad. Keep the current absolute timestamp behavior. No sound or
  calculator changes are proposed. Effort M, impact M.

### Finish summary, session-summary-screen.tsx

A lifter wants to save today's work, correct a date/duration and decide whether changes belong
in the plan. The current default-off plan switches and Back to workout are correct. But start
is an ISO string and duration is raw seconds. Record cards precede editing controls in every
step, and the summary repeats an unticked-set warning already shown before navigation.

- **SE-9 · Replace ISO/seconds entry with human date and duration controls.** Problem:
  `apps/native/src/session/components/session-summary-screen.tsx:235` binds startedAt directly
  to Field; line 246 binds a seconds string, and line 264 gives a generic invalid-summary error.
  Proposal: show a localized date/time row with the selected timezone and a bounded hours/minutes
  duration picker. Put errors beside the offending field, preserve all edits, and show the
  derived end time. Use keyboard-aware scrolling so save and the active field stay reachable.
  This follows the existing QA report's unresolved recommendation. Effort M, impact H.
- **SE-10 · Shorten Finish while preserving explicit consent.** Problem:
  `apps/native/src/session/components/session-screen.tsx:419` triggers a confirmation for
  unticked sets before the summary; summary line 256 repeats the count. Summary line 196 renders
  Records before all three steps, while lines 296 and 310 show both plan switches even when only
  one diff category matters. Proposal: make Finish open the review directly for nonempty sessions;
  place the unticked count beside "Save session" as the sole confirmation before dropping them.
  Retain the zero-sets discard confirmation. Make title, note and timing optional disclosures,
  with a clear stats overview and reachable Save. In the next step show "Session saved" and only
  applicable plan choices, both off; explain that weight changes preserve rep/effort ranges.
  Offer "Keep workout unchanged" explicitly. Reserve Record cards for celebration. Effort M,
  impact H.
- **SE-11 · Label finish recovery and record readiness accurately.** Problem:
  `apps/native/src/session/components/session-summary-screen.tsx:41` labels an error Retry
  callback "Done"; line 105 computes records from the current history result without displaying
  its readiness. Proposal: error gets Retry and a distinct Back action. While records cannot be
  established, say "Records unavailable" with a retry rather than implying no records or a new
  best. Confirm the finished session can still be saved/read independently. Effort M, impact H.

### History, history-screen.tsx

A lifter wants to find the relevant past session, compare similar days and log an omitted visit.
Weekly grouping and Log past workout already fit the model. The repaired History anchor/Back
route should stay. Older entries require indefinite scrolling, and week totals are calculated
from only the currently loaded page of sessions.

- **SE-12 · Make old sessions findable and partial week totals honest.** Problem:
  `apps/native/src/session/components/history-screen.tsx:26` groups the loaded sessions and
  line 69 totals those rows; line 51 fetches another page only at the scroll boundary. Proposal:
  add a compact title/workout search and date-range control, preserving filters and position on
  Back. For a week intersecting a page boundary, either query the full week's aggregate or label
  it "Loaded sessions" until complete. Distinguish no matching results from no history and offer
  Clear filters. Keep reverse chronology; no calendar grid is needed. Effort M, impact M.

### Session detail, session-detail-screen.tsx

A lifter wants to read exactly what they did, identify a record, or edit/share/reuse the session.
Exercise links and delete/Undo already exist. The detail grid uses a different numbering scheme
from planning/logging and generic record badges. A warm-up's presence beside counted totals
also needs explanation rather than leaving the user to reconcile the count.

- **SE-13 · Match historical set labels to the logging grid.** Problem:
  `apps/native/src/session/components/session-detail-screen.tsx:186` counts only working sets
  for numbers and uses bare W/D/F, while training's shared chipTexts numbers training sets with
  kind suffixes. Proposal: use the same badge formatter across preview/editor/logging/history,
  respecting the current vocabulary and any parallel kind changes. Add "Working sets; warm-ups
  excluded" to stats help. Let the Record badge at line 211 reveal the record type/value, rather
  than only a trophy and generic label. Effort M, impact M.
- **SE-14 · Distinguish unavailable history from zero Records.** Problem:
  `apps/native/src/session/components/session-detail-screen.tsx:49` computes flags immediately;
  line 139 renders their count without history status. Source failure at line 105 also hides the
  source link just as deletion does. Proposal: use "Records unavailable · Retry" on history
  failure; retain session actuals and stats. Distinguish a deleted source from an unavailable
  source, with an explanation that this Session is preserved. Give a missing Session an explicit
  "Back to History" body action. Effort M, impact M.

## Route and cross-screen acceptance

Routes reviewed: Home index, Train index/library, new Program, Program overview/details, Workout
preview/edit/exercise sheet, Session logging/summary, and History index/detail/log-past, including
their stack layouts. Thin routes generally preserve the vertical boundaries. Program overview's
Edit destination and pick-first creation's destination are the concrete mismatches in PG-3/WO-1.
Train's modal sheets and the session stack should keep their existing presentation. History's
initial index anchor and detail fallback are already repaired; do not undo them.

For a later implementation pass, use the following checks as acceptance criteria, not evidence
that this review exercised a device:

- Walk a fresh account through Build workout, select exercises, edit targets, preview and Start.
  Repeat as a returning user without an active program and with an active session. Each state
  needs an understandable next action, including deleted plans and failed local reads.
- Build a rotation with Upper A, Upper B, repeated Upper A and Rest. Train out of order, inspect
  progress, and edit one repeated workout. Confirm the UI explains shared slots and copies.
- Log sets one-handed on a small Android and iPhone with the keypad open. Check Previous versus
  actuals, ghost adoption, missing required fields, units, effort, duration timers and supersets.
  Check that automatic accordion movement keeps the current task in view.
- Finish with completed and unticked sets, with no sets, and with structure-only/targets-only
  diffs. Verify default-off plan updates, explicit session-saved status, and Back behavior. Edit
  an old session and confirm that saved-immediately set edits are clearly communicated.
- Test 200% system text, bold text, VoiceOver/TalkBack and Reduce Motion. Focus order should follow
  title, context, row values, completion, then actions. Reordering needs a non-drag path. After
  dismissing a sheet, return focus to its trigger; announce validation once. Do not announce a
  timer every second. Check touches at 44 points on iOS and 48 dp on Android, especially 40-high
  set cells and the duration button. These are proposed acceptance sizes, not measured failures.
- Check both light and dark themes under low brightness. Use semantic brand roles, readable
  muted Previous/ghost text, clear field edges and a focus ring distinct from selection. Keep
  state labels available without hue, fill, animation or cover imagery. Theme must remain
  color-only; compact/large-text adaptation must depend on available space and text size.

## Ranked top 10

Ranked by repeated gym-task benefit, confidence in the source finding and implementation scope.
Rows may group related components through one proposal, but each ID has a single definition above.

| Rank | ID    | Proposal                                      | Effort | Impact | Why first                                                       |
| ---- | ----- | --------------------------------------------- | ------ | ------ | --------------------------------------------------------------- |
| 1    | SE-5  | Protect actual entry and completion space     | M      | H      | Every logged set depends on readable, reachable cells           |
| 2    | SE-6  | Explain suggestions and failed ticks in words | M      | H      | Prevents ambiguity about what will be recorded                  |
| 3    | SE-9  | Human date/time and duration controls         | M      | H      | Removes raw ISO/seconds editing at the save boundary            |
| 4    | WO-1  | Open newly created workouts in the editor     | S      | H      | Removes an avoidable tap from every new plan                    |
| 5    | SE-10 | Shorten Finish while preserving consent       | M      | H      | Reduces repeated review without automatic plan changes          |
| 6    | PG-3  | Make Edit actions open the editor             | S      | H      | Fixes a concrete label/destination mismatch                     |
| 7    | TR-3  | Keep a start action for returning lifters     | S      | H      | Home remains useful without an active program                   |
| 8    | TR-6  | Explain cycle and rotation progress           | M      | H      | Replaces ambiguous initials with understandable next-up context |
| 9    | WO-8  | Explain rejected numeric target input         | M      | H      | Prevents silent reversion and duration-entry confusion          |
| 10   | PG-8  | Explain repeated-slot editing scope           | S      | H      | Prevents accidental changes to multiple training days           |

## Validation and handoff

This deliverable changes only this Markdown report. Findings need a device pass before calling
any visual/accessibility risk reproduced. No acceptance criteria above are marked as completed
implementation, and no application behavior has been changed by this task.

Checks run for this documentation change:

- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm knip`: passed.
- `pnpm i18n:check`: passed.
- `pnpm test -- --maxWorkers=2`: did not complete. The API build process was killed with exit
  137 before the complete test graph ran. Eight tasks succeeded; the full suite is not verified
  by this run. No unrelated application changes were made to address this environment failure.
- The report was formatted with `pnpm exec oxfmt --write` and its source references checked for
  existing files and valid line numbers. Only this report is included in the commit.
