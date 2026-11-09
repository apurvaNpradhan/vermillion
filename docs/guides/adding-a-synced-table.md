# Adding a synced table

Follow in order; each step ships additively ([ADR 0019](../adr/0019-synced-table-conventions.md)). `exercise` is the worked example (a Reference-data catalog plus per-user rows; see `packages/api/src/exercise/`). Rules: [.agents/sync.md](../../.agents/sync.md). The `notes` example that earlier versions of this guide used was removed ([0035](../adr/0035-remove-notes-example.md)); a table with user-deletable rows needs the tombstone steps below.

1. **Server table.** In `<vertical>/tables.ts` use the `@workspace/db` helpers: `id()` (UUIDv7), `userId` with `onDelete: "cascade"`, `createdAt`, `updatedAt`, `deletedAt` (nullable timestamptz). Add `CHECK (char_length(...))` matching the zod caps, a partial index `(user_id) WHERE deleted_at IS NULL` and an index per query sort key. Then `pnpm db:generate`.
2. **Publication and grant.** In the same or the next migration, hand-add `ALTER PUBLICATION powersync ADD TABLE "<t>";` and `GRANT SELECT ON "<t>" TO powersync_replication;`. The bootstrap creates the publication empty and never edits membership ([0023](../adr/0023-replication-setup.md)).
3. **Stream.** Add to `powersync/sync-config.yaml` only after step 2 is applied: explicit column list, `WHERE user_id = auth.user_id() AND deleted_at IS NULL`. Deploy order: migrate, then sync config, then clients.
4. **Upload handler.** Write `<vertical>/sync.ts` (a `SyncTableHandler`, see `exercise/sync.ts`): strict zod for PUT and PATCH data, `SyncRejection` codes for permanent failures, calls to the vertical's operations with the given transaction. For rows users can delete, DELETE is a soft delete and idempotent and `purgeTombstones` hard-deletes old ones while keeping a minimal deleted-id marker; if rows are never deleted (like exercises), refuse DELETE and have `purgeTombstones` return 0. Export it from the vertical's `index.ts` and add it to `syncTableHandlers` in `packages/api/src/platform/sync/registry.ts`.
5. **Client schema.** Add `packages/sync/src/<vertical>/tables.ts` (SQLite; see `exercise/tables.ts`) and register it in the schema assembly. Declare a local index on every sort or filter key: PowerSync stores JSON, so an unindexed `ORDER BY` parses every row. Derive boolean and JSON conversion from the SQLite column modes, never by column name.
6. **Parity.** Extend the declared expectation in `packages/api/src/platform/sync/parity.test.ts` (columns, defaults, indexes, publication members, and as they land, stream columns, handlers and SQLite indexes). `pnpm test` must pass; drift is a failure.
7. **Seam 3 test.** Add a case in `tests/sync/src/`: write on one client, read on a second, offline write then reconnect, a rejection, stream isolation between two users. Needs `pnpm db:start` and the API running; run `pnpm test:sync`.
8. **UI and i18n.** The module hook reads local rows with `LIMIT` and an id tie-breaker; forms send dirty fields only; show loading, error, first-sync, empty and offline states. Strings in `en` (English only for now); `pnpm i18n:check`.

## Pitfalls

- Always `LIMIT` and page: loading all rows into JS is the cost, not rendering.
- `adb reverse --remove` does not cut an open sync stream; kill the app for offline tests.
- Metro started by `expo run:android` in CI mode never picks up edits.
- `withUniwindConfig` must be the outermost Metro wrapper.
- pnpm errors on ignored dependency build scripts under `--frozen-lockfile`: add new native or build deps to `allowBuilds` in `pnpm-workspace.yaml`.
- A stream before its table is in the publication makes replication fail.
- Do not drop, rename or retype synced columns: devices up to 90 days old may still queue writes.
- Bump `SYNC_SCHEMA_VERSION` only for incompatible validator changes; prefer nullable or defaulted additions.
