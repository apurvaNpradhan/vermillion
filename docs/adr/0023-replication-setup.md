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

- Migrator locking (verified phase 2): the installed drizzle migrator (`drizzle-orm` 1.0.0-rc.5) takes no lock; it reads the applied list and then runs the pending ones in a transaction, so overlapping containers could both try one migration. `runMigrations` now holds a session advisory lock on a dedicated connection around it. The bootstrap uses a different advisory key, so the two never block each other.
- No separate migrator role (phase 2): the application role runs migrations and the app, owns the tables and the publication, and needs no superuser, `CREATEROLE` or `REPLICATION`. Preflight refuses a privileged application role in production and warns elsewhere (the development role is the `postgres` superuser). Revisit if the runtime should not be able to alter schema.
- Implementation: `packages/api/src/platform/sync/bootstrap.ts` (TypeScript runner, not psql), entry `apps/server/src/sync-bootstrap.ts`, run as `pnpm sync:bootstrap`, the dev compose `powersync-bootstrap` service and, in production, `node sync-bootstrap.mjs` from the server image. Steps commit separately and are idempotent; a rerun rotates role passwords from the environment and repairs the publication owner, but never touches membership. It ends by logging in as both roles.
- Restore checklist: [sync-restore-checklist.md](../sync-restore-checklist.md) (written phase 2).
- Open item, phase 8: rehearse the restore drill.
- Phase 2 starts with an empty sync config; the `notes` stream is activated only after phase 4's table and publication migration succeeds.
