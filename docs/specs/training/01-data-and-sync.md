# Training plans, slice 1: data and sync

Status: ready. Decisions: [ADR 0036](../../adr/0036-training-plans.md). Read [database](../../../.agents/database.md), [sync](../../../.agents/sync.md), [orpc-testing](../../../.agents/orpc-testing.md) and the [adding-a-synced-table guide](../../guides/adding-a-synced-table.md) first. Follow the `exercise` vertical's shape.

## Goal

Every signed-in device holds its owner's Programs, Workouts, Workout exercises and Slots in local tables, offline. All of them can be created, edited, reordered, copied, deleted and restored through the upload path. Weight-unit, effort-scale and default-rest preferences exist. No UI.

## Work

### Vocabulary (`packages/shared/src/training/`)

- `SET_KINDS` (`warmup, working, drop, failure`). `EFFORT_STEPS` (6, 6.5 … 10). `rpeToRir(rpe)`, `rirToRpe(rir)`.
- `TRAINING_LIMITS`: title 1–100, note ≤ 1,000, description ≤ 10,000, planned weeks 1–52, 40 exercises per Workout, 20 sets per exercise, 28 Slots, 100 live Programs, 500 live Workouts.
- `plannedSetSchema` and `plannedSetsSchema(exerciseType)`: `kind`, `reps_min`/`reps_max` (reps types, min ≤ max), `weight_kg` (≥ 0, optional), `effort_min`/`effort_max` (an `EFFORT_STEPS` value, min ≤ max, optional, reps types only), `duration_s`, `distance_m`, `floors`, `steps` (optional, only when `SET_FIELDS` lists the field). Unknown keys are refused, as are fields the type does not record. At most 20 sets.
- `defaultPlannedSets(exerciseType)`: 3 working sets. Reps types get 8–12, duration types 30 s, other fields empty. `defaultRestSeconds(exerciseType, preference)`: the preference, raised to 180 s for barbell compound types (rule in one tested table). `WARMUP_REST_SECONDS = 60`.
- `formatWeight(kg, unit)` and `parseWeight(text, unit)`: lb rounds to 0.5 lb, kg to 0.25 kg, and 45 lb round-trips. `derivedWorkoutTitle(primaryMuscles[])`: the up to three most frequent groups in first-appearance order, joined with `·`.
- zod input schemas for each row (`programInput`, `workoutInput`, `workoutExerciseInput`, `programSlotInput`) shared by native and the server.
- i18n keys for Set kinds, the effort labels (RPE and RIR) and units, in `en`.

### Preferences (`packages/shared/src/preferences.ts`)

Add to `ui` with defaults: `weightUnit: "kg" | "lb"` (default `kg`), `effortScale: "rpe" | "rir"` (default `rpe`), `defaultRestSeconds` (0–600, default 120).

### Postgres (`packages/api/src/training/tables.ts`)

Every table has `id uuid pk` (UUIDv7 from the client), `user_id text not null` (FK, cascade), `created_at`, `updated_at` and `deleted_at`, plus a partial index `(user_id) WHERE deleted_at IS NULL`. Length `CHECK`s match the zod caps.

- `program`: `title text not null`, `description text`, `planned_weeks smallint null CHECK 1–52`, `cover_key text null`.
- `workout`: `program_id uuid null` (FK program), `title text null` (null = derived), `note text`.
- `workout_exercise`: `workout_id uuid not null`, `exercise_id uuid not null` (FK exercise, no cascade: exercises are never deleted), `position text not null`, `rest_seconds smallint null` (null = off, 0–600), `note text`, `superset_group uuid null`, `sets jsonb not null default '[]'`.
- `program_slot`: `program_id uuid not null`, `workout_id uuid null` (null = Rest), `position text not null`.
- Indexes: `(workout_id, position, id)` and `(program_id, position, id)` where not deleted; `(program_id)` on workout.
- The migration adds all four to the `powersync` publication.

### Sync

- `powersync/sync-config.yaml`: one auto-subscribed `my_training` stream (priority 1) over the four tables, `WHERE user_id = auth.user_id() AND deleted_at IS NULL`, columns listed.
- `packages/sync/src/training/tables.ts`: client tables; `sets` as JSON text; local indexes on the ordering keys and on `program_id`. The parity test passes.
- `packages/api/src/training/sync.ts` upload handler: put, patch (dirty fields only) and delete/restore for rows the writer owns. It refuses the following permanently, with namespaced codes:
  - other users' rows
  - a parent that is missing or owned by someone else (including `exercise_id` not visible to the user)
  - a Slot whose `workout_id` belongs to a different Program
  - `sets` failing `plannedSetsSchema` for the exercise's type
  - any limit exceeded (live counts exclude the row being written).
    Deleting a Program soft-deletes its Workouts, their exercises and its Slots in the same transaction. Deleting a Workout soft-deletes its exercises and the Slots it fills. Restore reverses only what that delete did (same `deleted_at`).
- `packages/sync/src/training/store.ts`, inside the write-scope check: `createWorkout`, `updateWorkout`, `deleteWorkout`, `restoreWorkout`, `addExercises(workoutId, exerciseIds[])` (defaults applied, appended), `updateWorkoutExercise`, `moveWorkoutExercise(id, beforeId | null)`, `replaceExercise(id, exerciseId)` (keeps sets when the type matches), `removeWorkoutExercise`, `copyWorkout(id, targetProgramId | null)`, the matching Program and Slot operations, and `copyProgram`.
- `packages/sync/src/training/position.ts`: wraps `fractional-indexing` (`keyBetween`, ordering by key then id), with a tested rebalance when keys exceed 50 characters.

## Tests

- Unit: `plannedSetsSchema` per exercise type (accepts its fields, refuses others), effort conversion, weight round-trips, `defaultPlannedSets`, `derivedWorkoutTitle`, position keys (between, concurrent inserts at the same spot stay ordered by id, rebalance).
- Seam 1: handler create, patch, delete cascade and restore for each table; other owner refused; cross-program Slot refused; invalid sets refused; limits.
- Seam 3: two devices of one user reorder the same Workout offline and converge with no duplicates; a deleted Program's Workouts disappear from both; another user's rows never arrive.

## Done

`pnpm lint`, `typecheck`, `knip`, `test`, `i18n:check` and `test:sync` pass.
