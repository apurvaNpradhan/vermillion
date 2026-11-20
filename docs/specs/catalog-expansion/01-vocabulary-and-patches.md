# Catalog expansion, slice A: vocabulary, columns, sync, Catalog patches

Status: ready. Decisions: [ADR 0050](../../adr/0050-muscle-details-and-catalog-expansion.md). Read [database](../../../.agents/database.md), [sync](../../../.agents/sync.md), [typescript](../../../.agents/typescript.md), [orpc-testing](../../../.agents/orpc-testing.md) and the original [slice 1](../exercise-library/01-data-and-sync.md) first. No UI in this slice beyond i18n keys.

## Goal

The data model, sync and import path can carry Muscle details, the four new equipment kinds and Catalog patches. Nothing in the catalog changes yet: no patch file ships in this slice except test fixtures.

## Work

### Vocabulary (`packages/shared/src/exercise/vocabulary.ts`)

- `MUSCLE_DETAILS`: `as const` object, detail slug → group, exactly the 23 in ADR 0050. Derived `MuscleDetail` type, `MUSCLE_DETAIL_SLUGS` array, `detailsOf(group)` (ordered as in the ADR table) and `groupOf(detail)`.
- `MUSCLE_DETAIL_ALIASES`: detail → lowercase search aliases (for example `rear_delts: ["rear delt", "rear delts", "posterior delt", "rear deltoid"]`, `side_delts: ["side delt", "lateral delt", "medial delt"]`, `hip_flexors: ["hip flexor", "iliopsoas", "psoas"]`). English only, data not i18n; a unit test asserts every detail has at least its label's words.
- `EQUIPMENT` gains `cable`, `smith_machine`, `ez_bar`, `trap_bar` (append; order is the display order, so put `cable` after `machine`, `smith_machine` after it, `ez_bar` and `trap_bar` after `barbell`).
- `hasValidDetails({ primary_muscle, secondary_muscles, primary_detail, secondary_detail })`: details unique, primary details all in the primary group, each secondary detail's group in `secondary_muscles`, no detail in both lists. Used by the catalog schema, the Custom exercise schema and the upload handler.
- `customExerciseFields` gains `primary_detail` and `secondary_detail` (arrays of `MuscleDetail`, default `[]`); `customExerciseInput` refines with `hasValidDetails`. `catalogExerciseInput` (admin) gets the same.
- i18n (`en`): one key per detail (label as people say it: "Upper chest", "Side delts", "Rotator cuff", "Hip flexors", "TFL"), one per new equipment kind.

### Postgres (`packages/api/src/exercise/tables.ts`, migration)

- `primary_detail text[] not null default '{}'`, `secondary_detail text[] not null default '{}'`.
- `CHECK (primary_detail <@ ARRAY[...]::text[])` and the same for secondary, generated from the shared constant. Widen the equipment `CHECK` to the 13 kinds. Additive only: drop-and-recreate of a `CHECK` with a wider set is allowed by [database](../../../.agents/database.md); confirm and follow its exact pattern.
- `pnpm db:generate`; the migration is reviewed by hand.

### Sync

- `powersync/sync-config.yaml`: both exercise streams list the two new columns.
- `packages/sync/src/exercise/tables.ts`: two JSON text columns. Parity test passes.
- Parsing (`library.ts`, `detail.ts`, `muscles.ts` and any other reader): details parse **leniently**: unknown slugs are dropped, not a row failure (a later detail ships without a release gate). Equipment and groups stay strict.
- `ExerciseMuscles` and the library/detail row types carry `primary_detail` and `secondary_detail`.
- Upload handler (`packages/api/src/exercise/sync.ts`): accept the two fields on Custom exercises, validate with `hasValidDetails`, and refuse unknown slugs (server side is strict).
- `packages/sync/src/exercise/store.ts`: create and update accept the fields.

### Catalog patches (`packages/api/src/exercise/patches/`)

- Directory `packages/api/src/exercise/data/patches/` holds files `NNNN-<name>.json`, applied in name order. Each file:

  ```json
  {
    "requires_app_version": "1.4.0",
    "insert": [ /* full catalog rows, same schema as the seed file plus primary_detail/secondary_detail */ ],
    "fill": [ { "id": "…", "primary_detail": ["side_delts"], "instructions": "…" } ],
    "change": [ { "id": "…", "field": "equipment", "from": "machine", "to": "cable" } ]
  }
  ```

  `requires_app_version` optional. `fill` sets a field only when the row's value is empty (`null`, `''`, `'{}'`, or `rank = 0`). `change` sets the field only when the current value equals `from` (arrays compared as sets); fields allowed in `change`: `equipment`, `primary_muscle`, `secondary_muscles`, `rank`, `exercise_type` (only if no set references the exercise), `title`, `thumbnail_key`, `video_key`.
- Validation before any write: zod for the file; inserted rows pass `catalogRowSchema` + `hasValidDetails`; ids in `insert` are new; ids in `fill`/`change` exist and are catalog rows; titles unique across the catalog after the patch; the result of applying `fill`/`change` to each row still passes `hasValidDetails` (when a `change` is skipped, dependent fills that would break the rule are skipped with it and reported).
- `applyCatalogPatches(db, { gate })`: for each file not yet recorded in `reference_import` (key `patch:<file name>`, value its SHA-256), in one transaction per file: insert, fill, change, record. A recorded file whose bytes changed is an error (patches are immutable once applied; write a new file).
- **Gate**: when `gate` is on and the file has `requires_app_version` above `minimum_app_version` (or no minimum set), skip the file and log `exercise.catalog.patch_waiting`. Env `CATALOG_PATCH_GATE` in `packages/env` (server), default on in production, off otherwise.
- Called on server start right after `seedBundledCatalog`, and from the release procedure after `minimum_app_version` is written (same transaction is not required; call after commit, log failures).
- One log line per file: inserted, filled, changed, skipped changes (with ids), waiting.
- `pnpm --filter server catalog:import` also applies patches.

### Admin (`packages/api/src/exercise/catalog-admin/`)

- Create/update accept and return the two detail fields; `exportCatalog` writes them. The seed file stays as is (the export of a patched database is a new seed only if someone chooses to commit it).

### Glossary

- `CONTEXT.md`: add **Muscle detail** and **Catalog patch** (wording from ADR 0050); extend **Muscle group** and **Muscle distribution** to mention details.

## Tests

- Unit: `MUSCLE_DETAILS` totality (every detail's group is a real, drawable group), `hasValidDetails` cases, aliases present, lenient parse drops unknown details and keeps the row.
- Seam 1: patch fixture inserts, fills only empty fields, `change` applies when `from` matches and is skipped (reported) when the admin changed the value; re-run is a no-op; changed bytes of an applied file error; gate waits below the minimum and applies after the minimum is raised through the release procedure; validation failure writes nothing.
- Upload handler: Custom exercise with valid details accepted; detail outside its group refused; unknown slug refused.
- Seam 3: details arrive as JSON text and parse on the client.

## Done

`pnpm lint`, `typecheck`, `knip`, `test`, `i18n:check`, `test:sync` pass. A server start on a fresh database seeds 455 rows and logs zero patches.
