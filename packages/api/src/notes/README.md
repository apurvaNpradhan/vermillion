# notes (example vertical)

A reference implementation of a full vertical: table, one operation per file,
procedures, tests, sync handler and native module (`apps/native/src/notes`).
Replace it with the product's first vertical.

To remove it:

1. Delete this folder, `apps/native/src/notes` and `apps/native/app/(app)/notes`.
2. Remove `notes` from `platform/orpc/router.ts`, the notes tab in
   `apps/native/app/(app)/_layout.tsx`, and the `notes__*` keys from
   `packages/i18n/src/locales/*.json`.
3. Generate a migration that drops the table (`pnpm db:generate`).
