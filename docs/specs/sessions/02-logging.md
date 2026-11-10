# Sessions, slice 2: the logging screen

Status: ready after slice 1. Decisions: [ADR 0038](../../adr/0038-sessions.md) (Logging screen; Ticking, Previous and Ghost values; Number entry; Session lifecycle). Read [data-flow](../../../.agents/data-flow.md), [ui](../../../.agents/ui.md) and [i18n](../../../.agents/i18n.md).

## Goal

You can start a Workout or an empty Session, log every set with Previous and Ghost values on the custom keypad, edit the Session freely, minimise and resume it, take it over from another device, and finish it with a basic confirmation (the full Finish flow is slice 4).

## Work

- **Routes**: `/session/[id]`, presented modally above the tabs and dismissed by the chevron. Start points:
  - a temporary Start in the Workout menu; the preview arrives in slice 5
  - "Empty session" in Train's Create menu
- **Module hooks** (`apps/native/src/session/`): `use-active-sessions`, `use-session`, `use-session-actions`, `use-previous-sets(exerciseIds)`. Components never call the store.
- **Starting while one is active**: a sheet offers "Resume <title>" or "Discard and start".
- **Accordion**:
  - Collapsed rows show the thumbnail, the title and either "n/m" or the done summary.
  - Expanded rows show the pinned note, a rest chip, and the set grid: badge, Previous, the fields from `SET_FIELDS`, optional Effort, and a tick.
  - The session auto-opens on the first unfinished exercise and auto-advances after the last set. A superset opens as one block, and the highlight alternates between members.
  - "+ Add set" stays on the row just collapsed until its rest ends.
- **Ticking**: `tickValues`. When a field is missing, the cell shakes and gets a danger outline, and the tick is refused. Tapping Previous copies that set. Ghost values render muted inside empty cells.
- **Keypad** (`apps/native/src/platform/ui/keypad.tsx`): digits, a decimal point, − and + steps by equipment, Next, Done and an optional accessory chip slot (used by the plate chip in slice 6). It works with a hardware keyboard and labels every key for screen readers. Set cells are pressables, not TextInputs.
- **Exercise menu**: Replace (using the editor's "Swap for" pick), Add to / leave superset, Pinned note, Log effort on or off, and Remove. The set badge sheet changes the kind. Grips reorder the collapsed rows. "+ Add exercises" opens pick mode.
- **Header**: chevron, elapsed time (`started_at`-derived, tabular digits), volume and set counts from `sessionTotals`, the body icon (opens the muscle sheet in slice 5; hidden until then), and Finish.
- **Resume bar**: above the tab pill on every tab while a Session is active, showing the title, elapsed time and current exercise. Tapping it opens the Session. When there is more than one active Session, the bar reads "2 sessions in progress" and opens the chooser.
- **Take over**: if the Session's `device_id` belongs to another device, it shows read-only with Take over. A device that loses ownership shows "Continued on another device".
- **Basic Finish**: confirm "n sets not done won't be saved", drop unticked sets, set `finished_at`, then open a simple placeholder summary.
- **Forgotten session**: on app foreground, if the active Session's last tick is more than 3 h old, show the three-choice sheet.
- **Title**: the snapshot, or `derivedWorkoutTitle` while `title_derived` is true.

## Tests

- Unit: the accordion's next-exercise and superset order, keypad step and Next sequencing, and forgotten-session detection.
- Seam 1: none new.
- Manual, on the Android device: log a 3-exercise session with a superset; kill the app mid-session and resume; tick with empty cells (adopts the ghosts); tick a cell with no ghost (refused); replace an exercise; take over between two devices; finish with unticked sets.

## Done

The standard checks pass, plus the manual list recorded in [native development](../../guides/native-dev.md).
