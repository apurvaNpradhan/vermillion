# Share, slice 2: Workout and Program cards

Status: implemented (2026-11-16), after slice 1. Decisions: [ADR 0042](../../adr/0042-share-cards.md).

## Goal

Share a Workout as one card, and a Program as an Overview card plus one card per Rotation slot, through the slice 1 composer. Remove the plan text share.

## Work

- **Workout card** (in `training`, exported from its index):
  - The Program's title as a label when the Workout belongs to one, then the title (`displayTitle`).
  - Stats: exercises · working sets · "~N min" (`estimateMinutes`).
  - A small `BodyMapPair` built from the Workout's Muscle distribution.
  - Exercise rows with a thumbnail, name and the editor's summary line (the existing summarise-sets helpers and effort scale). Supersets get a side bracket, and warm-ups show as a faint "+N warm-up".
  - Planned weights only when Show weights is on (default off).
  - Rows compact to fit up to 12, then "+N more".
- **Program cards**:
  - Overview: Program cover (local Media) or the theme background, title, "N weeks · N days/week" (weeks omitted when unset; days are the Rotation's non-rest slots), a Rotation day strip, and the combined Muscle distribution map.
  - Then one Workout card per slot, in Rotation order, labelled "Day N of M · Title". Rest slots get no card.
  - The composer pages through them like templates. Share sends the card on screen.
- **Composer**: the Photo background is offered for a Program with a cover. Plans have no Sticker.
- **Entry points**: on the Workout and Program pages, a header share icon, and "Share" replaces "Share as text" in the ⋯ menus. Both open `share/[kind]/[id]`.
- **Remove** `planAsText`, its tests, `useSharePlan` and the unused i18n keys.

## Tests

- Unit:
  - Working-set count and warm-up count.
  - Days per week from a Rotation.
  - Day labels across repeated slots.
  - Superset bracket grouping, reusing the supersets helpers.

## Done when

All checks pass. On device:

- A 4-day Program shares its Overview card and every Workout card.
- A Workout with more than 12 exercises ends in "+N more".
- Weights stay hidden until toggled on.

## As built

- `training/share/cards.tsx` contains Workout and Program Overview cards, exposed through the
  training index. `WorkoutShareScreen` and `ProgramShareScreen` connect them to the composer.
- Workouts use `displayTitle`, `estimateMinutes`, `summariseWorking` and the saved effort scale.
  Working sets exclude warm-ups; warm-ups have a separate muted count. Rest and notes are omitted.
  Show weights starts off and is remembered independently for Workouts and Programs.
- Exercise rows resolve only local thumbnails through `ExerciseThumbnail localOnly`, participating
  in the composer's image-settle gate. Rows compact at 7 and 10 exercises, show at most 12, and
  finish with the remaining count. Superset grouping uses `supersetPlaces` on the visible rows,
  so a truncated group closes at the last visible member.
- Muscle heat reuses `muscleDistribution`, treating planned sets as completed and excluding
  warm-ups. Program heat includes each Rotation occurrence of a Workout.
- `readProgramPlan` now includes planned weeks and cover Media. `usePlanShareData` refreshes the
  full plan when Program or Workout tables change and discards stale reads after cleanup.
- A Program has an Overview page followed by one page per non-rest Rotation slot. Repeated slots
  remain separate pages, labelled with their original day numbers including intervening rest days.
  The Overview shows all Rotation slots, with denser tiles for long Rotations.
- A cover uses `MediaImage localOnly`, full file or local thumbnail, as the Overview's fixed Photo
  background. It has no privacy toggle and is also available as a background for the other pages.
  Without a cover the composer defaults to Theme. There are no Sticker templates for plans.
- Header icons and Share menu actions open the new route kinds. `planAsText`, its test,
  `useSharePlan`, and all `training__share_*` keys are removed.
- Text uses the existing tested card palette roles. No new contrast roles were introduced.

### Not verified here

Device rendering and export remain unverified. Check a four-day Program, repeated slots and Rest,
all backgrounds in each theme, a Workout with more than 12 exercises, weights off/on, cover and
thumbnail fallbacks offline, and that Save/Share exports the visible page at 1080 × 1920.
