# Sync restore checklist

Written in phase 2 for [ADR 0023](adr/0023-replication-setup.md); rehearsed in phase 8. Use it when Postgres is restored from a backup, PowerSync's storage is lost, or a replication slot is invalidated. The general Postgres restore is in the [runbook](runbook.md#restore-drill).

Know first: PowerSync's bucket storage (`powersync_storage` database) is derived data. The source of truth is the application database. A client's unsent writes live on the device and are never part of a restore.

## 1. Decide what was lost

| Situation                                                     | Do                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| Slot invalidated (`/api/ready` degraded, `wal_status = lost`) | Steps 2, 4, 5, 6: resnapshot.                         |
| `powersync_storage` lost or corrupt                           | Steps 2, 3, 4, 5, 6.                                  |
| Application database restored from a backup                   | All steps. Treat every slot and the storage as stale. |
| Only the PowerSync container died                             | Restart it; nothing to restore. Watch slot lag.       |

## 2. Stop writers to the sync path

1. Stop the `powersync` service. Leave the API running only if the restored database is already in place.
2. Note the oldest and newest synced row you expect (a Custom `exercise` row id or timestamp) to check against later.

## 3. Restore the application database (only if it was lost)

1. Stop the server application, restore the backup into the Postgres service, start the server (it migrates on start).
2. Check the Postgres flags are still set: `wal_level = logical`, `max_wal_senders`, `max_replication_slots`, `max_slot_wal_keep_size`.
3. Auth signing keys (the JWKS) live in the application database. A backup older than a key rotation brings the old keys back; devices then re-authenticate ([runbook](runbook.md#rotate-secrets)).

## 4. Re-run the bootstrap

`node sync-bootstrap.mjs` from the server image (development: `pnpm sync:bootstrap`). Role passwords are set with `ALTER ROLE ... PASSWORD`, which Postgres logs when `log_statement` is `ddl` or `all`: turn that off first or treat the log as secret. It is idempotent: it recreates a missing role, storage database or publication and never changes publication membership.

Then check the publication still lists the synced tables (`SELECT * FROM pg_publication_tables WHERE pubname = 'powersync'`). A restore from a backup that predates a table's migration cannot list it; the migrations that run on server start re-add it (`ALTER PUBLICATION powersync ADD TABLE ...` is part of each synced table's migration). Do not hand-add tables.

## 5. Reset PowerSync's side

1. Drop stale slots: `SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name LIKE 'powersync_%' AND NOT active;`
2. If the storage database was lost or the sync config changed incompatibly, drop and recreate `powersync_storage` (the bootstrap recreates it empty), or let PowerSync reprocess.
3. Start `powersync`. It creates a new slot and takes a fresh snapshot. Watch `/probes/readiness` and the `sync.slot-lag` log lines until readiness is true and lag falls.

## 6. Verify and resume

1. `/probes/readiness` on PowerSync returns 200 and `/api/ready` returns `ok`.
2. A test account writes a row; it appears on a second device (the synthetic check of ADR 0025).
3. Compare the row you noted in step 2 with the server.
4. Devices resync from the new snapshot on their own. Their local upload queues are untouched: unsent writes upload after reconnect, and writes that no longer apply become recoverable Rejected writes (ADR 0018). Never wipe a device to "fix" a resync.

## Not covered yet

Alert routing, the timed drill and the deployment-specific commands arrive in phase 8.
