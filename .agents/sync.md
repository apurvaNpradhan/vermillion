# Sync

Local-first sync: PowerSync (self-hosted) replicates Postgres rows to SQLite on the device; writes queue locally and upload through `sync.upload`. Reasons: ADRs [0015](../docs/adr/0015-powersync-self-hosted.md)–[0027](../docs/adr/0027-sync-build-plan.md). Adding a table: [guide](../docs/guides/adding-a-synced-table.md).

## Layout

- `powersync/`: `service.yaml` (env-driven), `sync-config.yaml` (streams, edition 3).
- `packages/api/src/platform/sync/`: `sync.credentials` / `sync.upload` procedures, `registry.ts` (handler allowlist), `handler.ts`, receipts (`tables.ts`), bootstrap, slot lag, purge, parity.
- `packages/api/src/<vertical>/sync.ts`: the vertical's upload handler; it calls the vertical's operations.
- `packages/shared` (`sync.ts`): wire schemas, limits, `SYNC_SCHEMA_VERSION`. Runtime-neutral.
- `packages/sync`: client Drizzle (SQLite) schema per vertical under `src/<vertical>/`, row conversion, database factory.
- `apps/native/src/platform/local-database`: the encrypted database and the lifecycle wiring.
- `tests/sync`: seam 3 (`@workspace/sync-tests`).

## Rules

- Streams list columns explicitly, never `*`, and filter `user_id = auth.user_id()`; the one exception is Reference data such as the exercise catalog (`user_id IS NULL`, ADR 0034), which no client may write. Never trust a client `user_id`; handlers use the session user.
- Synced tables: UUIDv7 `id` made on the client, `user_id` with cascade. Rows that users can delete use a `deleted_at` soft delete: streams exclude deleted rows, and the purge job (a handler's `purgeTombstones`) hard-deletes content after 120 days but atomically keeps minimal deleted-id/owner markers until account deletion, so a late PUT cannot resurrect a purged row. Exercises are retired, never deleted, so their handler purges nothing (ADR 0034). The removed `notes` tables show the tombstone shape ([0035](../docs/adr/0035-remove-notes-example.md)).
- App writes carry the install-id `writeScope` captured by their hook; check it inside the SQLite write transaction. The native app-tabs boundary remounts account-scoped UI when that identity changes across tabs.
- Forms send dirty fields only (changed since edit start), never the live row. Same-field conflicts: server application order. Exercise forms keep a draft (`apps/native/src/exercise/form/exercise-draft.ts`): baseline, values and the dirty-field patch. Rejected writes stay on the device until the user discards them, never expired (`use-rejected-exercises`). Manual checks: [walkthrough](../docs/guides/sync-ux-walkthrough.md).
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
# Linux host that drops container-to-host traffic (PowerSync logs PSYNC_S2204):
docker compose -f docker-compose.yml -f compose.linux.yml up -d --wait
```

`compose.linux.yml` runs PowerSync on the host network (still `127.0.0.1:8090`, override with `POWERSYNC_HOST_PORT`), so it reaches Postgres and the API's JWKS on loopback. Never use it for production.

Seam 3 suites (`tests/sync/src`): `exercise` (catalog and library streams, then the upload protocol on Custom exercises: round trip, isolation, ack loss, rejections, offline queue), `training` (the real store on two devices: plan round trip, offline reorder convergence, delete cascade and undo, isolation; the `my_training` stream, ADR 0036), `races` (concurrent edits, refused deletes, foreign ids, rollback siblings), `compat` (schema window, old queued writes, local query plan, first-sync timing), `faults` (PowerSync stop/start, cut database sessions, dropped replication slot). Files run sequentially. `faults` disturbs shared services and runs only when `SYNC_TEST_POWERSYNC_CONTAINER` names the PowerSync container (CI sets `vermillion-powersync-1`); locally point it, with `SYNC_TEST_POWERSYNC_URL` and `SYNC_TEST_DATABASE_URL`, at a throwaway stack: a second PowerSync (`--network host`, its own port, replicating a scratch database with its own storage database) and an API on port 3000 using the same scratch database. Postgres itself is never restarted by the tests (it may be shared); the Postgres-loss case cuts every session of the database, including the replication connection. What each suite proves and what it cannot: [support matrix](../docs/guides/sync-support-matrix.md).

## Where to look

- Replay, limits, error codes: ADR 0018. Table conventions and conflicts: 0019. Credentials and JWT: 0017. Bootstrap: 0023. Tests: 0024. Alerts: 0025.
- Operating it: [runbook](../docs/runbooks/sync.md), [restore checklist](../docs/sync-restore-checklist.md), [deployment](../docs/deployment.md#sync-infrastructure).
- `exercise` (`packages/api/src/exercise/`) is the reference synced table: a Reference-data catalog plus per-user Custom exercises, retire-never-delete, catalog import at startup (`pnpm --filter server catalog:import`), `pnpm catalog:convert <source>` to regenerate the data file.
