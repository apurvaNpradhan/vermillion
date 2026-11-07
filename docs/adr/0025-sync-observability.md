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

- Open item: production WAL budget and `max_slot_wal_keep_size` sizing, derived from write rate and outage plus snapshot recovery time (4GB is a development setting only).
- Open item, phase 2/8: alert routing and where alerts are delivered.
- Open item, phase 5: the minimal client diagnostic state; phase 8: the full diagnostics screen (`en` and `de`).
