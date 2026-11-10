# Sessions, slice 6: plate calculator and Gym equipment

Status: ready after slice 2. Decisions: [ADR 0038](../../adr/0038-sessions.md) (Plate calculator and Gym equipment).

## Goal

On a barbell-type exercise, the keypad's plate chip shows how to load the target weight with the user's own bars and plates. The user can manage, add and disable equipment.

## Work

- **Solver** (`packages/shared/src/training/plates.ts`, pure): `loadBar(targetKg, bar, plates)` returns plates per side (largest first, respecting counts per pair), the loaded total, and `exact`. When not exact it returns the closest loadable weight at or below the target and the closest above it.
- **Seeding**: the first time the calculator opens with no equipment, write `defaultGymKit(weightUnit)`.
- **Sheet**:
  - "Target: 60 kg" and the bar picker as chips; the last bar used is remembered in `exercise_setting.bar_id`
  - an SVG of one side of the bar: bar stub, collar, then plates with height and width by weight and colour by standard plate colour tokens (added to brand tokens), each labelled
  - available plates as toggle chips
  - when not exact: "Closest: 57.5 kg · 62.5 kg", each with Use (which writes the cell)
- **Manage equipment**: Bars and Plates sections with toggles; "+ Custom bar" (weight, name) and "+ Custom plate" (weight, count per pair or unlimited); swipe to delete with Undo. Units follow the preference, and both kits can exist.
- **Which exercises**: the chip shows for equipment `barbell`, plus any exercise whose setting has a bar (so "Use plate calculator" can be turned on from the exercise menu for a smith machine or a plate-loaded machine).

## Tests

- Unit: solver exact and inexact cases, limited counts, a 0 kg bar, lb kits, and a target below the bar.
- Seam 1: equipment validation (weight > 0, count ≥ 1, unit).
- Manual: load 60, 61 and 142.5 kg; add a 1.25 kg pair and see 61 kg become loadable; switch kg to lb.

## Done

The standard checks pass and the manual checks are recorded.
