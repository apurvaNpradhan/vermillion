# notes (example vertical)

A reference implementation of a full vertical: table, one operation per file,
procedures, tests, web module (`apps/web/src/notes`), native module
(`apps/native/src/notes`). A fork deletes it entirely.

To remove it:

1. Delete this folder, `apps/web/src/notes`, `apps/native/src/notes`,
   `apps/web/src/routes/_app/notes`, `apps/native/app/(app)/notes`,
   `apps/web/e2e/notes.spec.ts`.
2. Remove `notes` from `platform/orpc/router.ts`, the sidebar item in
   `apps/web/src/shell/components/app-layout.tsx`, the notes tab in
   `apps/native/app/(app)/_layout.tsx`, and the `notes__*` keys from
   `packages/i18n/src/locales/*.json`.
3. Generate a migration that drops the table (`pnpm db:generate`).
