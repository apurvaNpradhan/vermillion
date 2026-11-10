# Training plans, slice 4: Supersets, cover photos, Share as text

Status: blocked on slice 3. Decisions: [ADR 0036](../../adr/0036-training-plans.md).

## Goal

Supersets can be built in the editor, a Program can carry a personal cover photo, and any plan can be sent as text.

## Work

### Supersets

- Row ⋯ "Superset with next" gives this exercise and the next one the same `superset_group`, joining the next one's group if it already has one. "Remove from superset" clears it. A group of one is cleared automatically.
- Grouped rows show a left bracket in the `identity` role and a "Superset" label. Rest is edited once for the group and stored on its last member; the other members show "No rest" and their rest is null. Dragging a member out of its run of consecutive rows removes it from the group.
- `supersetRuns(exercises)` is pure and tested. It covers groups, gaps, and members that are no longer consecutive after a concurrent reorder (each consecutive run is treated as its own group).

### Cover photos

- Program details gains "Add photo": the system picker (`expo-image-picker`), a 1:1 crop, a resize to 1024 px JPEG, and a copy into `documentDirectory/program-covers/<programId>.jpg`.
- A local-only `program_cover (program_id, uri, updated_at)` table in the client schema, never uploaded. `cover_key` stays null.
- The Program tile and screen header use the photo when there is one, and show "Photo on this device only" in the details sheet. The file is removed when its Program is deleted and its Undo window has passed, and on account wipe.

### Share as text

- `planAsText(program | workout, prefs)` is pure and tested. Output: the title, then the description as plain text, then each Slot or Workout, then one line per exercise (`Bench Press: 2 warm-up, 3 × 6–8 @ RIR 1–2, rest 3:00`, then the pinned note on the next line).
- Exposed from the Workout and Program ⋯ menus through the system share sheet.

## Tests

- Unit: `supersetRuns`, `planAsText` for a 6-Slot Program in both effort scales and both units.
- Native: screenshots of a superset in the editor and a Program with a cover in light and dark; a shared text pasted into a messaging app.

## Done

All repo checks pass; screenshots attached. The Session grilling begins next. Following a Program (Active program, Cycles, Runs, the end-of-Run moment) is specified after it.
