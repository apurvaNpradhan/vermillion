# Sync support matrix

What is proven, where, and what is not. Recorded for phase 7 of [the sync plan](../specs/local-first-sync.md); the strategy is [ADR 0024](../adr/0024-test-strategy.md). Last run: 2026-11-09 (all but the fault suites; the notes example was removed and its tests moved onto Custom exercises, [0035](../adr/0035-remove-notes-example.md)), Linux x64, a loaded development machine. Nothing here is a performance promise.

## Proven by automated tests

| Claim                                                                              | Where                                                          | Run                       |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------- |
| Duplicate and concurrent uploads of one replay key apply once; mismatches refused  | seam 1 `platform/sync/sync.test.ts`                            | `pnpm test`               |
| A database fault mid-transaction stores nothing (no rows, no receipt); retry works | seam 1, a real Postgres trigger raising an error               | `pnpm test`               |
| Pool survives Postgres dropping idle connections                                   | seam 1 `platform/db-pool.test.ts`                              | `pnpm test`               |
| Postgres, publication, stream columns, handlers and indexes agree                  | `platform/sync/parity.test.ts`                                 | `pnpm test`               |
| A delete is refused and recorded; the row survives on every device                 | seam 3 `races.test.ts`                                         | `pnpm test:sync`          |
| Concurrent edits converge; id owned by another user; rollback of sibling ops       | seam 3 `races.test.ts`                                         | `pnpm test:sync`          |
| Schema version outside the window pauses the queue, keeps writes, resumes later    | seam 3 `compat.test.ts`                                        | `pnpm test:sync`          |
| Writes queued by an older local schema apply with server defaults                  | seam 3 `compat.test.ts`                                        | `pnpm test:sync`          |
| A write the current validator refuses is recorded as rejected, not dropped         | seam 3 `compat.test.ts`                                        | `pnpm test:sync`          |
| The library list query starts from a local index, never a table scan               | seam 3 `compat.test.ts`, SQLite `EXPLAIN QUERY PLAN`           | `pnpm test:sync`          |
| PowerSync stopped and started during writes: devices converge, queues conserved    | seam 3 `faults.test.ts`                                        | `pnpm test:sync` + faults |
| Every database session cut during uploads and replication: converge, conserved     | seam 3 `faults.test.ts`                                        | `pnpm test:sync` + faults |
| Replication slot dropped and PowerSync resnapshots: pending writes survive         | seam 3 `faults.test.ts` (the runbook's invalidated-slot steps) | `pnpm test:sync` + faults |

"Queue conservation" in the fault tests means: afterwards the upload queue is empty and the client holds a permanent verdict, applied or rejected, for every transaction it made. A rejected write is the recorded outcome; nothing is silently dropped.

`+ faults` means `SYNC_TEST_POWERSYNC_CONTAINER` is set ([sync guide](../../.agents/sync.md)); the CI `sync` job sets it.

## Platforms

| Platform                          | Proven here                                                                                                                                     | Not proven here                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headless Node (`@powersync/node`) | Protocol, convergence, fault recovery, SQLite query plans                                                                                       | SQLCipher: Node is a different VFS and cipher                                                                                                                                          |
| Native (iOS, Android)             | Shared logic in `packages/sync` unit tests                                                                                                      | SQLCipher release binary cold start, wrong or missing key, backup restore, runtime mismatch, release-device first sync. Needs a maintainer with a device ([native-dev](native-dev.md)) |
| Postgres server restart           | A full restart is **not** run: the test Postgres may be shared. Cutting all sessions of the database, including the walsender, stands in for it | A real restart (recovery, WAL replay) on a dedicated instance                                                                                                                          |
| Slot `wal_status = lost`          | Dropping the slot and resnapshotting, as the runbook says                                                                                       | The server invalidating a slot by `max_slot_wal_keep_size` (the recovery path is the same)                                                                                             |

Offline behaviour on a device is not proven by automated tests: native is unproven until a device run. The web rows of earlier runs were removed with the web app ([ADR 0033](../adr/0033-mobile-first-api-host.md)).

## Measurements (not gates)

First sync of 1,000 Custom exercises of about 200 bytes each (plus the catalog) into an empty headless Node device, local stack: about 0.2 s from `connect()` to all rows readable (one run; seam 3 prints it as `first sync of 1000 custom exercises: N ms`). Device numbers are not measured; SQLCipher is slower than Node's SQLite and the figure must not be reused for it.

Library list query plan on the product's local schema (1,000 rows, A-Z, no filter):

```
SEARCH ps_data__exercise USING INDEX ps_data__exercise__exercise_retired_at_idx (<expr>=?)
USE TEMP B-TREE FOR ORDER BY
```

The muscle and equipment filters also start from an index. The sort by title is done in memory over the matching rows: with a catalog of about 455 and at most 1,000 live Custom exercises that is the accepted cost, and `LIMIT` bounds what is returned. The earlier notes list could avoid the sort with a composite index; the library sorts by a case-insensitive title, which no index serves.

## Still to do by hand

1. Native release build on a device: cold start offline, wrong key, first sync of a seeded account; record timings.
2. Rehearse the restore and resnapshot drill on a production-like stack ([runbook](../runbooks/sync.md)).
