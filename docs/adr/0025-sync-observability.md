# 0025. Observability ships with the sync setup

Status: accepted (2026-11-07). Covers D17.

## Context

A stopped PowerSync service silently fills the disk with WAL. A job inside the failing stack cannot report its own outage, and slot lag alone misses a wrong stream filter, a stuck client queue or a missing publication table. `max_slot_wal_keep_size` is not a hard disk cap or a recovery plan.

## Decision

- Basic probes and alerts ship with the infrastructure phase, not at the end.
- External alerts cover service reachability, disk, WAL retention and headroom, slot invalidation and snapshot failure. Liveness is separate from dependency readiness. The PowerSync readiness probe (`/probes/readiness`) is the Dokploy health check; the API probe is `/api/health`.
- A pg-boss job reads `pg_replication_slots`, logs lag through `@workspace/logger` and marks readiness degraded at the critical threshold. It is a supplement to the external alerts.
- Thresholds (settled 2026-11-07): warn at 1 GB, critical at 3 GB (readiness degraded), both env-configurable. Development sets `max_slot_wal_keep_size=4GB`.
- Client diagnostics (settings, web and native): connection state, last successful upload and checkpoint, upload queue length and oldest pending age, rejected writes with retry and discard, rejection rate.
- A bounded synthetic test-account write-and-read convergence check. No indiscriminate production health-data hashes or logs.
- A recovery drill matters more than another dashboard.

## Consequences

- Implementation (phase 2): the `sync.slot-lag` pg-boss job (every 5 minutes) reads this database's `powersync_%` slots and logs `warn` at the warn threshold and `error` at the critical one; `/api/ready` returns 503 `degraded` at critical lag or an invalidated slot (`wal_status = lost` or an invalidation reason). `/api/health` stays liveness only and Dockerfile and Dokploy keep using it, because restarting the API does not drain WAL. A missing slot is `absent`, not critical: PowerSync creates it on first connect and a deployment without sync has none. A service that never connects is caught by the external reachability probe.
- Alert event (phase 2): a critical slot (lag at the critical threshold, `unreserved` or `lost` WAL, or an invalidation reason) logs one stable error event, `action: "sync.alert.slot-lag-critical"` (`SLOT_LAG_ALERT_ACTION`), with `slot`, `lagBytes`, `walStatus`, `safeWalSize` and `invalidated`. Warnings use `sync.slot-lag` at `warn`. `/api/ready` is fail-closed (503 when the database or slot view is unreadable, or the slot is critical) and its body is the status only.
- Open item, phase 8: alerts not covered yet are disk and WAL headroom, PowerSync snapshot failure and alert routing; phase 2 only supplies the log event and the probes.
- Open item: production WAL budget and `max_slot_wal_keep_size` sizing, derived from write rate and outage plus snapshot recovery time (4GB is a development setting only).
- Open item, phase 2/8: alert routing and where alerts are delivered.
- Open item, phase 5: the minimal client diagnostic state; phase 8: the full diagnostics screen (`en` and `de`).
