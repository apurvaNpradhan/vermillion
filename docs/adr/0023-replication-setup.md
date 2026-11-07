# 0023. Replication setup: privileged bootstrap, then migrations

Status: accepted (2026-11-07). Covers D16.

## Context

PowerSync needs a replication role, a publication, a storage database and per-table grants. The app role should not need superuser, `CREATEROLE` or `REPLICATION`. `CREATE DATABASE` cannot share a transaction with the rest of setup.

## Decision

- A one-time privileged, idempotent bootstrap run with an admin URL (by `pnpm db:start` in dev, a one-shot Dokploy job in prod): the `powersync_replication` role (`LOGIN REPLICATION`), the `powersync_storage` database with its own role, and an empty `powersync` publication owned by the app role.
- Per synced table, inside a normal Drizzle migration: `ALTER PUBLICATION powersync ADD TABLE` and `GRANT SELECT` to the replication role.
- The bootstrap sets explicit ownership and CONNECT/USAGE grants, runs preflight checks of admin, migrator and runtime URLs and roles, excludes concurrent runs, resumes after partial failure, and fails closed on mismatch. A rerun never resets publication membership.
- Rollback is application or config rollback with forward-compatible schema, not automatic down-SQL.
- A restore procedure covers app database, bucket storage, slots and JWT keys, and includes a resnapshot drill that preserves client outboxes.
- Test clones never share production replication slots or config.

## Consequences

- Open item, phase 2: verify the installed migrator's locking before adding another lock; decide whether a separate migrator role is needed.
- Open item, phase 2/8: the restore checklist and drill (written phase 2, rehearsed phase 8).
- Phase 2 starts with an empty sync config; the `notes` stream is activated only after phase 4's table and publication migration succeeds.
