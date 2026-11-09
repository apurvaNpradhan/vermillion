# Exercise library, slice 5: thumbnail prefetch and pick mode

Status: blocked on slices 3 and 4. Decisions: [ADR 0034](../../adr/0034-exercise-library.md).

## Goal

The library looks complete offline, and the workout builder can reuse it to choose exercises.

## Work

### Thumbnail prefetch

- After the catalog's priority bucket first completes, and again when the catalog changes, prefetch every live catalog thumbnail into expo-image's disk cache.
- Only on an unmetered connection (`expo-network`), in batches of 20, cancelled on disconnect or account reset, resumable (skips cached keys). No progress UI; a debug log line with counts.
- Videos are never prefetched.

### Pick mode

- `ExerciseLibrary mode="pick"` presented as a sheet. Tapping a row toggles selection with an order number badge; a bottom bar shows "Add N" and Clear. `onPick(ids: string[])` returns ids in the order picked.
- Options: `max?` (1 for "replace exercise"), `exclude?` ids already in the workout.
- Archived exercises cannot be picked; a Custom exercise created from inside pick mode is selected on return.
- A demo entry point is not added; training wires it up.

## Tests

- Unit: prefetch planner (which keys, skip cached, batching, cancel), pick ordering and `max`.
- Native: adb screenshots light and dark of pick mode with a selection, and an airplane-mode library after prefetch.

## Done

All repo checks pass; screenshots attached. The training grilling session starts from ADR 0034's contract.
