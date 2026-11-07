# Verticals

Domain code is organised as deletable slices. The same shape applies in `packages/api/src`, `apps/web/src` and `apps/native/src`.

```text
packages/api/src/
  platform/            shared infrastructure; importable from anywhere
  notes/
    index.ts           the public surface; the only file other verticals may import
    procedures.ts      oRPC procedures, thin: input, auth, call an operation
    operations/        one operation per file, plain functions taking the db and ids
    tables.ts          Drizzle tables (may import other verticals' tables for foreign keys)
    notes.test.ts
apps/web/src/notes/    index.ts, hooks (use-notes.ts), components/
apps/native/src/notes/ same shape
```

## Boundary rule

`boundaries/vertical-boundaries` (oxlint, `scripts/lint/boundaries-plugin.mjs`) fails an import of another vertical unless it goes through that vertical's `index.ts`. `platform` and, on the apps, `routes`, `lib`, `assets` and `styles` are not verticals. Tests are exempt.

If two verticals need each other's internals, either export a deliberate function from one `index.ts` or move the shared piece to `platform`. Do not add a wildcard export.

## Add a vertical

1. Create the folder with `tables.ts`, `operations/`, `procedures.ts`, `index.ts` and a test.
2. Register the router in `platform/orpc/router.ts`; register queues in `platform/jobs/queues.ts` if it has jobs.
3. `pnpm db:generate` for the migration (additive only).
4. Web and native: add the module with its hook, thin route files, `en` and `de` keys.

## Delete a vertical

Delete the folder in each tree, remove the router line, route files, navigation entries and locale keys, then `pnpm db:generate` for a migration that drops its tables (in a later release if data is live). `packages/api/src/notes/README.md` lists the steps for the example slice.

## Personal accounts only

`authed` in `platform/orpc/base.ts` is the one seam that resolves the signed-in user. A collaboration fork extends it to require membership; verticals should not look up the session themselves.
