# Sync

Local-first sync: PowerSync (self-hosted) replicates Postgres rows to SQLite on web and native; writes queue locally and upload through `sync.upload`. Reasons: ADRs [0015](../docs/adr/0015-powersync-self-hosted.md)–[0027](../docs/adr/0027-sync-build-plan.md). Adding a table: [guide](../docs/guides/adding-a-synced-table.md).

## Layout

- `powersync/`: `service.yaml` (env-driven), `sync-config.yaml` (streams, edition 3).
- `packages/api/src/platform/sync/`: `sync.credentials` / `sync.upload` procedures, `registry.ts` (handler allowlist), `handler.ts`, receipts (`tables.ts`), bootstrap, slot lag, purge, parity.
- `packages/api/src/<vertical>/sync.ts`: the vertical's upload handler; it calls the vertical's operations.
- `packages/shared` (`sync.ts`): wire schemas, limits, `SYNC_SCHEMA_VERSION`. Runtime-neutral.
- `packages/sync`: client Drizzle (SQLite) schema per vertical under `src/<vertical>/`, row conversion, database factory.
- `apps/web/src/platform/{powersync,offline}`, `apps/native/src/platform/local-database`: per-platform database and lifecycle.
- `tests/sync`: seam 3 (`@workspace/sync-tests`).

## Rules

- Streams list columns explicitly, never `*`, and filter `user_id = auth.user_id()`. Never trust a client `user_id`; handlers use the session user.
- Synced tables: UUIDv7 `id` made on the client, `user_id` with cascade, `deleted_at` soft delete. Streams exclude deleted rows; the purge job hard-deletes after 120 days.
- Forms send dirty fields only (changed since edit start), never the live row. Same-field conflicts: server application order. Use `startDraft`/`draftPatch`/`applyLatest` from `@workspace/sync`; a note deleted under an open form offers save-as-new or discard. Rejected writes are retried (new local transaction) or discarded by the user, never expired. Manual checks: [walkthrough](../docs/guides/sync-ux-walkthrough.md).
- Order for a new table: additive migration (table, `ALTER PUBLICATION powersync ADD TABLE`, `GRANT SELECT` to `powersync_replication`), then the stream in `sync-config.yaml`, then clients. A stream before its publication entry breaks replication.
- Handlers are registered in `registry.ts`; an unregistered table is rejected. Limits are validated before work.
- The parity test must pass: Postgres, publication, stream columns, handlers and SQLite indexes agree.
- Local index on every sort or filter key, always `LIMIT` and page.
- Never log row payloads, rejected-write payloads or tokens.
- Never wipe a device to fix sync; only server-confirmed account deletion wipes ([0021](../docs/adr/0021-device-owner-and-account-lifecycle.md)).
- No package imports both `@workspace/db` and `@workspace/sync` (lint boundary; test-only exceptions are listed there). Client Drizzle is pinned `0.45`, the server is on the catalog RC.
- Native needs a dev client; changing a native module or build flag bumps `NATIVE_STACK_REVISION`: [native-dev](../docs/guides/native-dev.md).
- Synthetic data only until the [privacy readiness](../docs/privacy-readiness.md) sign-off.

## Commands

```sh
pnpm db:start          # Postgres, bootstrap (one shot), PowerSync on 127.0.0.1:8090
pnpm sync:bootstrap    # rerun the idempotent bootstrap
pnpm test:sync-infra   # bootstrap, slot and probe tests (need db:start)
pnpm test:sync         # seam 3: stack and API running
```

## Where to look

- Replay, limits, error codes: ADR 0018. Table conventions and conflicts: 0019. Credentials and JWT: 0017. Bootstrap: 0023. Tests: 0024. Alerts: 0025.
- Operating it: [runbook](../docs/runbooks/sync.md), [restore checklist](../docs/sync-restore-checklist.md), [deployment](../docs/deployment.md#sync-infrastructure).
- Notes (`packages/api/src/notes/`) is the reference synced table.

## Not landed yet (wave B)

The `notes` publication/grant migration and stream, and the client connector, land after this guide was written. Until then `sync-config.yaml` has no streams and the parity test expects no publication.
