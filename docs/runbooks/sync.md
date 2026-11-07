# Sync runbook

Operations for PowerSync and the replication path. General runbook: [runbook](../runbook.md). Setup: [deployment](../deployment.md#sync-infrastructure). Restore: [sync restore checklist](../sync-restore-checklist.md).

Ground rules: bucket storage (`powersync_storage`) is derived data; Postgres is the source of truth; a device's unsent writes live on the device and survive every procedure here. Never wipe a device to fix sync. Never log or paste row payloads.

> Drill status: the restore and resnapshot drill below has **not been rehearsed**. Phase 8 exit needs the maintainer to time it on a production-like stack and record the date and result here.

## Slot lag warn or critical

Signals: log `sync.slot-lag` at `warn` (1 GB) or `sync.alert.slot-lag-critical` at `error` (3 GB); `/api/ready` returns 503 `degraded` at critical. Thresholds: `SYNC_SLOT_LAG_WARN_MB`, `SYNC_SLOT_LAG_CRITICAL_MB`.

1. Is PowerSync running and ready? `/probes/readiness`. A stopped service is the usual cause: restart it.
2. Inspect: `SELECT slot_name, active, wal_status, safe_wal_size, pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS lag FROM pg_replication_slots WHERE slot_name LIKE 'powersync_%';`
3. Lag falling after restart: watch until below warn. Lag growing with an active slot: a large write burst or a stuck snapshot; check PowerSync logs.
4. `wal_status` of `unreserved` or `lost`, or lag nearing `max_slot_wal_keep_size`: act now; the slot will be invalidated and the disk is at risk. Restart PowerSync; if it cannot catch up, go to the invalidated-slot procedure.
5. Restarting the API does not help; that is why Dokploy does not use `/api/ready`.

## Invalidated slot: resnapshot

Signal: `wal_status = lost` or an invalidation reason; `/api/ready` degraded. Device outboxes are untouched, so pending writes are preserved.

1. Stop the `powersync` service.
2. Drop the dead slot: `SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name LIKE 'powersync_%' AND NOT active;`
3. Run the bootstrap job (idempotent, keeps publication membership). Check `pg_publication_tables` still lists the synced tables.
4. If the storage database is suspect, drop `powersync_storage` and rerun the bootstrap.
5. Start `powersync`. It creates a new slot and a fresh snapshot. Wait for `/probes/readiness` 200 and `/api/ready` `ok`; lag should fall.
6. Verify with a test account: write on one device, see it on another. Devices resync on their own; their queued writes upload after reconnect, and writes that no longer apply become recoverable Rejected writes.
7. Afterwards raise `max_slot_wal_keep_size` or shorten outage detection if the cause was a long outage ([ADR 0025](../adr/0025-sync-observability.md)).

## PowerSync down

1. Users keep working offline; uploads queue. The API and web are unaffected.
2. Restart the container; check Dokploy health (`/probes/readiness`) and its logs for storage or source connection errors (passwords, `PS_SSLMODE`, network).
3. The slot keeps WAL while it is down: start the lag clock. Past about an hour of heavy writes, check lag as above.
4. If the image changed, confirm the pinned tag and digest in compose match [deployment](../deployment.md).

## Bootstrap partial failure

The job exits non-zero on any preflight failure; steps commit separately and are idempotent.

1. Read the failing step in the job log. Typical causes: admin URL lacks CREATEROLE/CREATEDB/REPLICATION, non-URL-safe passwords, wrong flags (`wal_level`).
2. Fix the cause and rerun the job. A rerun recreates missing roles, the storage database or the publication, rotates the role passwords from the environment and never changes publication membership.
3. Turn off `log_statement = ddl|all` around the job: role passwords are set with `ALTER ROLE` and would be logged.
4. Do not start PowerSync until the job ends by logging in as both roles.

## Rotating JWKS

Better Auth rotates the Ed25519 signing keys every 30 days; PowerSync refetches `PS_JWKS_URI`. Tokens last 5 minutes.

1. Normal rotation needs no action. Check that `/api/auth/jwks` serves the new key and old key until old tokens expire.
2. Forced rotation (suspected leak): stop the server, delete the rows of the `jwks` table (Better Auth creates a new key on next use), start the server, restart PowerSync to drop its key cache. All devices fetch new tokens within minutes; local data and queues are untouched. Unverified: whether rotating `BETTER_AUTH_SECRET` affects the stored private keys; check against the installed plugin before relying on it ([rotate secrets](../runbook.md#rotate-secrets)).
3. A database restored from a backup older than a rotation brings old keys back; devices re-authenticate.

## Restore

Follow the [sync restore checklist](../sync-restore-checklist.md). Not yet rehearsed; see the drill note above.
