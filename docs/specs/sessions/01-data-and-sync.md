# Sessions, slice 1: data and sync

Status: ready. Decisions: [ADR 0037](../../adr/0037-session-storage-and-training-entry.md), [ADR 0038](../../adr/0038-sessions.md). Read [database](../../../.agents/database.md), [sync](../../../.agents/sync.md), [orpc-testing](../../../.agents/orpc-testing.md) and [training slice 1](../training/01-data-and-sync.md) first. Everything joins the existing `training` vertical.

## Goal

Every signed-in device holds its owner's Sessions, Session exercises, Logged sets, Gym equipment and Exercise settings offline. They can be written through the upload path with per-set independence, and pure, tested functions compute Previous, Ghost values, volume, Records and muscle distribution. No UI.

## Work

### Vocabulary (`packages/shared/src/training/`)

- `SESSION_LIMITS`: 40 exercises, 20 sets per exercise, title 1–100, note ≤ 1,000, duration override ≤ 86,400 s, backfill no more than 10 years back and not in the future.
- zod inputs: `sessionInput`, `sessionExerciseInput`, `sessionSetInput`, `gymEquipmentInput`, `exerciseSettingInput`. A set accepts only the fields `SET_FIELDS` lists for the snapshot `exercise_type`, plus `rpe` (an `EFFORT_STEPS` value) on reps types. `target` is a `plannedSetSchema` value or null.
- `bodyweightKg` (nullable, 20–400) added to the `ui` preferences, along with `keepAwake` (default true).
- Pure functions, each with its own test file:
  - `previousFor(history, kind, ordinal)`: the matching set from the latest finished Session.
  - `ghostFor(field, previous, target)`: the ADR's rules, including reps falling back to the range's lower bound.
  - `tickValues(set, ghosts, fields)`: the values to write, or the list of missing fields.
  - `effectiveWeight(type, weightKg, bodyweightKg)`.
  - `setVolume`, `sessionTotals` (volume, counted sets and reps, warm-ups excluded).
  - `estimatedOneRepMax` (Brzycki, 1–12 reps, else null).
  - `exerciseRecords(sessions)` and `recordFlags(sessions)`: which sets were Records at the time, ordered by `started_at` then id.
  - `muscleDistribution(sets, exercises)`: primary 1, secondary 0.5.
  - `defaultGymKit(unit)`: kg bars 20/15/10 (EZ)/0 and plates 25…0.5, or lb bars 45/35/25/0 and plates 45…2.5.

### Postgres (`packages/api/src/training/tables.ts`)

Add the five tables from ADR 0038 (`program_run` waits for slice 7). They use the usual columns and partial live index, with `CHECK`s matching the zod caps.

- Indexes:
  - `session (user_id, started_at desc)`
  - `session_exercise (session_id, position, id)` and `(exercise_id)`
  - `session_set (session_exercise_id, position, id)`
  - unique `exercise_setting (user_id, exercise_id) WHERE deleted_at IS NULL`
- `session.workout_id`, `program_id` and `slot_id` are **not** foreign keys with cascade: plans may be deleted while history stays.
- `session_exercise.exercise_id` is an FK without cascade.
- The migration adds the tables to the `powersync` publication.

### Sync

- `sync-config.yaml`: add the five tables to the `my_training` stream with their columns listed.
- Client tables in `packages/sync/src/training/tables.ts`, with `target` stored as JSON text. Local indexes on `session_exercise.exercise_id`, `session.started_at` and `session.finished_at`. The parity test passes.
- Upload handler, refusing permanently with namespaced codes:
  - foreign rows
  - a parent that is missing or foreign, including `exercise_id`
  - set fields not valid for the snapshot type
  - any limit exceeded
  - a backfill date outside the allowed window

  It never refuses a second active Session. Deleting a Session soft-deletes its exercises and sets, and restore reverses that same delete.

- Store (`packages/sync/src/training/session-store.ts`):
  - `startSession(workoutId | null)`: copies the exercises, sets and targets, the title snapshot and `device_id`; sets are unticked
  - `addSessionExercises`, `replaceSessionExercise`, `moveSessionExercise`, `removeSessionExercise`
  - `addSet`, `updateSet`, `tickSet`, `untickSet`, `removeSet`
  - `startRest`, `adjustRest`, `clearRest`
  - `takeOver`, `finishSession`, `discardSession`, `restoreSession`, `logPastSession`
  - `upsertEquipment`, `setExerciseSetting`

  `tickSet` writes one row in one transaction.

- Watches in `watch.ts`:
  - `watchActiveSessions()`, which may return more than one
  - `watchSession(id)`
  - `watchExerciseHistory(exerciseId)`: finished Sessions with that exercise's counted and warm-up sets
  - `watchSessionsBetween(from, to)`
  - `watchEquipment()`

## Tests

- Unit: every pure function above, including ghost edge cases (no Previous, reps outside the range, duration types), bodyweight and assisted volume with and without a bodyweight, Record flags after a middle Session is deleted, and distribution with secondaries.
- Seam 1: create, patch, delete and restore for each table; foreign parent refused; wrong-type fields refused; limits; two active Sessions both accepted.
- Seam 3 (the 0037 proofs):
  - a tick made offline arrives
  - kill and resume keeps the ticked sets
  - replay is idempotent
  - another account's Sessions never arrive
  - two devices tick different sets of one Session offline and both survive
  - the same set edited on both devices ends server-order last-write-wins

## Done

`pnpm lint`, `typecheck`, `knip`, `test`, `i18n:check` and `test:sync` pass.
