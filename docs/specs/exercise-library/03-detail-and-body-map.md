# Exercise library, slice 3: detail screen and body map

Status: blocked on slice 2. Decisions: [ADR 0034](../../adr/0034-exercise-library.md). Reference implementation: the spike's `~/Workspace/projects/vermillion/packages/body-map` and its ADR 0028 (body map).

## Goal

Tapping an exercise opens a detail screen that teaches it and, once there is history, puts the user's own numbers first. The body map is shared by the detail screen and the filter sheet.

## Work

### Body map (`apps/native/src/body-map/`)

- `core/`: `BODY_GROUPS` (the 17 drawable groups) and `GROUP_LAYERS` (group → art layers per view), for example `lats → latissimus_dorsi`, `upper_back → middle/lower trapezius, teres, infraspinatus`, `lower_back → erector_spinae`, `abductors → gluteus_medius, tensor_fasciae_latae`, `adductors → hip_adductors`, `traps → upper trapezius`. `UNDRAWN = ["cardio", "full_body", "other"]`. Hit resolution ported from the spike (grid masks, prefer highlighted then smaller), returning a group slug.
- `assets/interim/`: the spike's greyscale layers and masks, plus its generator script. A README states the licence gate.
- Renderer `BodyMap` props: `view` (front / back), `primary`, `secondary`, `intensity?: Partial<Record<Group, number>>`, `selected?`, `onPressGroup?`. The art is drawn as it is, never tinted (grey body, muscle layers in their own colour): primary opacity 1, secondary lighter, intensity as opacity. Accessibility actions per highlighted group.
- `BodyMapPair`: front and back side by side, sized to width.
- Coverage tests: every `MUSCLE_GROUPS` slug is in `GROUP_LAYERS` or `UNDRAWN`; every layer has a file and a mask.
- The filter sheet's Muscle section gains its Body view: tap toggles a group.

### Detail screen (`apps/native/app/(app)/exercises/[id].tsx`, `apps/native/src/exercise/detail/`)

- Module hook `useExercise(id)` (retired rows resolve) and `useSwapCandidates(exercise)` (live rows, same primary muscle, different equipment, ordered by rank then title, at most 8).
- Layout, one scroll, no tabs:
  - Video hero (expo-video, muted, looping, starts when the screen is focused, poster from the thumbnail, falls back to the thumbnail offline or on error). Full-bleed 4:3 with no history; 16:9 when history exists. Title fades into the compact header.
  - "Your numbers" block (last session, best, 12-week trend): rendered only when the training hook returns data; returns nothing today.
  - Title, `aka` line, chips (muscle, equipment, how it is logged).
  - `BodyMapPair` with primary and secondary; tapping a group shows its name, and offers "Browse <group>" which opens the library filtered.
  - Form: numbered instructions; collapsed when history exists; hidden when empty.
  - Swap for: horizontal row of candidate cards.
  - Sticky "Add to workout": shown disabled with a "coming soon" hint until training exists, or hidden; pick one and note it in the PR.
- Header menu: for Custom exercises, Edit and Archive / Restore (slice 4 wires them).

## Tests

- Unit: `GROUP_LAYERS` coverage, hit resolution, intensity clamping, swap-candidate query.
- Native: adb screenshots light and dark of a catalog exercise, one with no instructions, one with no media, a retired one, and the filter sheet's Body view.

## Done

All repo checks pass; screenshots attached.
