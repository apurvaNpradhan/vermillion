# Share, slice 2: Workout and Program cards

Status: planned (2026-11-16), after slice 1. Decisions: [ADR 0042](../../adr/0042-share-cards.md).

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
