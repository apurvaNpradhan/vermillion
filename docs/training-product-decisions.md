# Training product decisions

Reviewed against the Android app and realistic demo plans on 2026-11-10.

## Editor behavior

Keep one navigation rule: tapping an exercise expands its set table inside the workout. Use the
same table for repeated targets, warm-ups and different targets. Reverting to a full sheet only
for mixed sets would make a workout's behavior change when its first warm-up is added. Keeping
every table expanded would make six-exercise plans too long.

Only one exercise should be expanded at a time. This keeps the other exercise summaries reachable
and gives numeric inputs room. Detailed exercise editing remains available through the row menu
for the pinned note and a roomier table. Remove the duplicate Edit sets button under the same grid.
Workout title and note editing belong in the workout overflow menu, leaving the preview read-first.

The trade-off is that rep ranges require one focused picker. Keep Exact reps / Rep range explicit,
with labelled bounds and atomic validation. A hidden icon or a clickable separator saves a tap only
for people who already know it. Weight remains directly editable, and effort uses the existing
bounded control. Fix keyboard visibility before adding any more target controls.

Individual-set edits stay local to that set. The cost is more taps when changing an identical
target across several existing sets. A future explicit Apply to working sets action could address
that; silently propagating a cell edit or changing editor mode when targets become equal would
make its scope harder to understand. New sets copy the last training target. Warm-ups can record
weight as well as reps; preparation loads are useful information, and the storage contract already
supports them. Do not guess warm-up loads from working weight without an explicit future feature.

On Android, wiring focus events to HeroUI alone did not lift the rep picker above the keyboard.
The picker now uses the measured keyboard inset, and both the inline and detailed screens use
keyboard-aware scrolling. On the connected phone, both rep bounds and Done were visible above the
IME, Done dismissed it, and opening effort from a focused weight input dismissed the keyboard.
The manual regression command is documented in [native development](guides/native-dev.md#training-keyboard-checks).

## Workout identity and muscle coverage

Workout lists use title initials in the same compact grouped rows as Programs. The muscle tiles
and larger Workout cards were removed after device feedback; the two plan types now share row
spacing, typography, metadata, swipe actions and menu placement. Program-owned Workout rows also
use initials. Programs retain their selected cover, with the same initial tile as a fallback.

The expanded Workout details retain aggregate muscles from every exercise, not just the first.
Direct targets are highlighted strongly; assisting muscles use a lower opacity. Muscle names
accompany the larger front/back view.

This is a coverage map, not a volume or recovery score. The catalog does not define how much a
compound set contributes to each assisting muscle. Equal coloring is not a claim of equal training
stimulus. A volume heatmap would need an explicit counting model, warm-up exclusions and logged
Session data. Undrawn groups such as cardio retain their text labels.

Program identity is different: retain a user-selected cover or generated initial. Summing every
muscle across a full program often colors almost the entire body and says little about which
program it is.

## Plans, programs and sessions

Keep Workout as a reusable day plan, Program as its owner and rotation, and Session as the future
record of performed training. Copies are independent; reused slots deliberately point to one
workout. The reuse picker must explain that edits affect every linked slot. A small ×2 badge alone
is insufficient explanation, but repeating a paragraph below every program is noise.

Keep the non-calendar order. Missing a day should not create overdue work. Add day groups the
creation choices inside a Program. Train uses the unified layout selected after comparing
[two mockups](mockups/train-layouts.html). Two compact Program rows appear above standalone
Workout rows, with View all opening the full Program library. This limit keeps large Program
libraries from burying Workouts. One Create action in the header offers Workout and Program;
there is no collection switcher or duplicate floating creation button. Workout rows prioritize
the title, exercise count and duration. Search/filtering becomes worthwhile
when realistic libraries grow beyond a screen, not as an empty search bar today.

Home is still temporary. Once Sessions exist it should prioritize Resume, then Next up, then
completed training. Saved plans should not be labelled recent workouts. Do not add inert Start
buttons, invented weekly metrics or progression recommendations before the logging loop works.

Workout duration estimates use explicit duration targets when available, including continuous
cardio. Untimed sets still assume 40 seconds plus planned rest, so the displayed time remains an
estimate. The recovery demo exposed the previous error: 25 minutes of cardio was counted as two
40-second sets. Estimating distance-only work or setup time more accurately needs additional data.

## What should happen next

1. Design the full Session loop around crash-safe per-set rows from ADR 0037: start, complete,
   rest, resume, finish, then optional explicit plan updates. Test background/resume and account
   changes before adding progression.
2. Add previous-session values and a compact session history. Those are more useful during
   training than more plan metadata or decorative dashboards.
3. Add a native regression suite for keyboard-visible editing and start/resume. Pure helper tests
   cannot catch a sheet being covered by Android's keyboard. Current checks use the real phone.
4. Resolve catalog and body-art redistribution rights before public distribution. Demo plans do
   not make third-party text or imagery licensed.

## Demos

The local development command is `pnpm --filter server training:demo <account-id>`.
It refuses production mode and non-local database hosts. It adds three standalone plans and two
programs containing four owned workouts, validating sets against the real catalog exercise types.
The seed is transactional, scoped to the selected existing account, and does not overwrite existing
demo titles. Repeating it creates nothing extra. The weights are fictional fixtures, not personal
training advice. Users may edit or delete these plans like any others; nothing reseeds on startup.
