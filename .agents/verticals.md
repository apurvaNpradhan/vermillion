# Verticals

Domain code is organised as deletable slices. The same shape applies in `packages/api/src` and `apps/native/src`.

```text
packages/api/src/
  platform/            shared infrastructure; importable from anywhere
  exercise/
    index.ts           the public surface; the only file other verticals may import
    sync.ts            the upload handler of a synced table (a vertical with an API calls it from procedures.ts)
    operations/        one operation per file, plain functions taking the db and ids
    tables.ts          Drizzle tables (may import other verticals' tables for foreign keys)
    sync.test.ts
  legacy/              definitions of tables whose vertical was removed (see below)
apps/native/src/exercise/ index.ts, hooks (use-exercise-library.ts), components/
```

## Boundary rule

`boundaries/vertical-boundaries` (oxlint, `scripts/lint/boundaries-plugin.mjs`) fails an import of another vertical unless it goes through that vertical's `index.ts`. `platform` is not a vertical. Tests are exempt.

If two verticals need each other's internals, either export a deliberate function from one `index.ts` or move the shared piece to `platform`. Do not add a wildcard export.

## Add a vertical

1. Create the folder with `tables.ts`, `operations/`, `procedures.ts`, `index.ts` and a test.
2. Register the router in `platform/orpc/router.ts`; register queues in `platform/jobs/queues.ts` if it has jobs.
3. `pnpm db:generate` for the migration (additive only).
4. Native: add the module with its hook, thin route files, `en` keys (English only for now).

## Delete a vertical

Delete the folder in each tree (API, `packages/sync`, `packages/shared`, native), remove the router and sync handler registrations, route files, navigation entries, stream and locale keys, and move its tests onto another vertical rather than dropping them. Migrations are additive-only ([0007](../docs/adr/0007-additive-migrations.md)), so the tables stay in Postgres: keep their minimal Drizzle definitions in `packages/api/src/legacy/` (the drizzle config reads that folder) so `pnpm db:generate` produces no DROP, and leave the table in the `powersync` publication. Dropping the tables is a separate, deliberate migration in a later release, once no client and no backup needs the data. The worked example is the removal of `notes`: [ADR 0035](../docs/adr/0035-remove-notes-example.md).

## Personal accounts only

`authed` in `platform/orpc/base.ts` is the one seam that resolves the signed-in user. Verticals should not look up the session themselves.
