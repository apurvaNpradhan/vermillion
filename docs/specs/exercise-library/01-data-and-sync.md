# Exercise library, slice 1: data, importer, sync

Status: ready. Decisions: [ADR 0034](../../adr/0034-exercise-library.md). Read [database](../../../.agents/database.md), [sync](../../../.agents/sync.md), [orpc-testing](../../../.agents/orpc-testing.md) and the [adding-a-synced-table guide](../../guides/adding-a-synced-table.md) first. Follow the `notes` vertical's shape.

## Goal

Every signed-in device holds the exercise catalog and its owner's Custom exercises in one local `exercise` table, offline. Custom exercises can be created, edited, archived and restored through the upload path. No UI.

## Work

### Vocabulary (`packages/shared/src/exercise/`)

- `MUSCLE_GROUPS` (20 slugs from the source: `abdominals, abductors, adductors, biceps, calves, cardio, chest, forearms, full_body, glutes, hamstrings, lats, lower_back, neck, other, quadriceps, shoulders, traps, triceps, upper_back`), `EQUIPMENT` (9: `none, barbell, dumbbell, kettlebell, machine, plate, resistance_band, suspension, other`), `EXERCISE_TYPES` (9: `weight_reps, reps_only, bodyweight_reps, bodyweight_assisted_reps, duration, distance_duration, short_distance_weight, floors_duration, steps_duration`), each `as const` with its type.
- `MUSCLE_REGION` (upper / lower / other) for the filter grouping.
- `SET_FIELDS`: exercise type → the set fields it records (weight, reps, duration, distance, floors, steps). Unit-tested for totality.
- `customExerciseInput` zod schema and limits (title 1–100 trimmed, instructions ≤ 2,000, secondary muscles unique and not containing the primary). Shared by the form (slice 4) and the server.
- `searchTokens(query)`: lowercase, trim, split on whitespace, drop empties, escape `%`, `_`, `\`. Unit-tested.
- i18n keys for every slug in `en`.

### Conversion (`scripts/catalog/convert-catalog.ts <source-path>`)

- Reads the source JSON array; writes `packages/api/src/exercise/data/exercises.json`, sorted by id, two-space indented, one object per exercise:
  `id, title, primary_muscle, secondary_muscles (sorted), equipment, exercise_type, is_full_bodyweight, rank, search_terms, aka, instructions, video_key, thumbnail_key, retired (bool)`.
- Mapping: `muscle_group → primary_muscle`, `other_muscles → secondary_muscles`, `equipment_category → equipment`, `hundred_percent_bodyweight_exercise → is_full_bodyweight`, `priority → rank`, `manual_tag` lowercased → `search_terms`, `localised_instructions.en` → `instructions` (null when empty), `is_archived → retired`, URLs → keys (path after the host). Drop every non-English title and instruction.
- Fails loudly on an unknown slug or a URL on another host. No product names in code, comments or file names.
- A `catalog:convert` script in the root `package.json`.

### Postgres (`packages/api/src/exercise/tables.ts`, `packages/db`)

- `exercise` as in ADR 0034: `id uuid pk`, `user_id text null` (FK to user, cascade on delete), `title text not null`, `primary_muscle text not null`, `secondary_muscles text[] not null default '{}'`, `equipment text not null`, `exercise_type text not null`, `is_full_bodyweight boolean not null default false`, `rank smallint not null default 0`, `search_terms text`, `aka text`, `instructions text`, `video_key text`, `thumbnail_key text`, `retired_at`, `created_at`, `updated_at`.
- `CHECK`s for the three slug columns (generated from the shared constants), `length(title)` and `length(instructions)` matching the zod caps.
- Indexes: partial `(user_id) WHERE user_id IS NOT NULL`; unique `(title) WHERE user_id IS NULL`.
- `reference_import (catalog text pk, fingerprint text, imported_at)`, server-only.
- Migration adds `exercise` to the `powersync` publication; `reference_import` is not added.

### Importer (`packages/api/src/exercise/operations/import-catalog.ts`)

- Validate the whole file with zod plus cross-row checks (unique ids and titles, secondary excludes primary) before any write.
- SHA-256 of the file bytes; return early when it equals `reference_import.fingerprint` for `exercise`.
- One transaction: upsert `user_id IS NULL` rows with `ON CONFLICT (id) DO UPDATE … WHERE (columns) IS DISTINCT FROM (excluded)`, setting `updated_at = now()` only on change; `retired_at` from the file's `retired` flag; retire catalog rows absent from the file; restore returning ones; write the fingerprint. Refuse if an id in the file belongs to a Custom exercise.
- Log one line with counts (inserted, updated, retired, restored, unchanged).
- Called from the migrate step after migrations (publication already exists). Also `pnpm --filter @workspace/api catalog:import`.
- Ensure the data file is in the server image.

### Sync

- `powersync/sync-config.yaml`: `exercise_catalog` (priority 3, `WHERE user_id IS NULL`) and `my_library` (priority 1, `WHERE user_id = auth.user_id()`), columns listed, `updated_at` server-only, retired rows included.
- `packages/sync/src/exercise/tables.ts`: client `exercise` table; arrays as JSON text; local indexes on `title`, `primary_muscle`, `equipment`, `retired_at`. Parity test passes.
- `packages/api/src/exercise/sync.ts` upload handler: put, patch (dirty fields only, ADR 0019) and archive/restore (patch of `retired_at`) for rows the writer owns; refuse catalog rows and other users' rows permanently; force server-owned columns; validate with the shared schema; enforce the live-count limit (excluding the row being written); refuse an `exercise_type` change once any set references the exercise (no set table yet: the check is a function the training slice fills in, tested as a no-op now). Refusals use namespaced codes.
- `packages/sync/src/exercise/store.ts`: `createCustomExercise`, `updateCustomExercise`, `archiveExercise`, `restoreExercise`, inside the write-scope check (ADR 0021).

## Tests

- Unit: vocabulary totality, `SET_FIELDS`, `searchTokens`, `customExerciseInput`, the committed file passes importer validation and has 455 rows.
- Seam 1 (cloned Postgres): fresh import inserts all; rerun skipped by fingerprint; forced rerun writes nothing; one edit updates one row; removal retires; return restores; an id clash with a Custom exercise refuses the import.
- Upload handler: owner create, patch, archive, restore; catalog write refused; other user's row refused; limits; server-owned columns forced.
- Seam 3: two users both receive the catalog; each sees only their own Custom exercises; arrays arrive as JSON text readable with `json_each`; a client write to a catalog row ends as a Rejected write.

## Done

`pnpm lint`, `typecheck`, `knip`, `test`, `i18n:check`, `test:sync` pass. `pnpm db:start` then a server start imports the catalog once and logs counts.
