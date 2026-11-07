# Sync support matrix

What is proven, where, and what is not. Recorded for phase 7 of [the sync plan](../specs/local-first-sync.md); the strategy is [ADR 0024](../adr/0024-test-strategy.md). Last run: 2026-11-07, Linux x64, a loaded development machine. Nothing here is a performance promise.

## Proven by automated tests

| Claim                                                                              | Where                                                          | Run                                  |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| Duplicate and concurrent uploads of one replay key apply once; mismatches refused  | seam 1 `platform/sync/sync.test.ts`                            | `pnpm test`                          |
| A database fault mid-transaction stores nothing (no rows, no receipt); retry works | seam 1, a real Postgres trigger raising an error               | `pnpm test`                          |
| Pool survives Postgres dropping idle connections                                   | seam 1 `platform/db-pool.test.ts`                              | `pnpm test`                          |
| Postgres, publication, stream columns, handlers and indexes agree                  | `platform/sync/parity.test.ts`                                 | `pnpm test`                          |
| Delete wins; late edit or create of a deleted id is a recorded rejection           | seam 3 `races.test.ts`                                         | `pnpm test:sync`                     |
| Late edit of a purged row; id owned by another user; rollback of sibling ops       | seam 3 `races.test.ts`                                         | `pnpm test:sync`                     |
| Schema version outside the window pauses the queue, keeps writes, resumes later    | seam 3 `compat.test.ts`                                        | `pnpm test:sync`                     |
| Writes queued by an older local schema apply with server defaults                  | seam 3 `compat.test.ts`                                        | `pnpm test:sync`                     |
| A write the current validator refuses is recorded as rejected, not dropped         | seam 3 `compat.test.ts`                                        | `pnpm test:sync`                     |
| The notes list query uses the local index (no full sort)                           | seam 3 `compat.test.ts`, SQLite `EXPLAIN QUERY PLAN`           | `pnpm test:sync`                     |
| PowerSync stopped and started during writes: devices converge, queues conserved    | seam 3 `faults.test.ts`                                        | `pnpm test:sync` + faults            |
| Every database session cut during uploads and replication: converge, conserved     | seam 3 `faults.test.ts`                                        | `pnpm test:sync` + faults            |
| Replication slot dropped and PowerSync resnapshots: pending writes survive         | seam 3 `faults.test.ts` (the runbook's invalidated-slot steps) | `pnpm test:sync` + faults            |
| Offline cold start of the built web shell                                          | `apps/web/e2e-offline` (Chromium)                              | `pnpm --filter web test:e2e:offline` |

"Queue conservation" in the fault tests means: afterwards the upload queue is empty and the client holds a permanent verdict, applied or rejected, for every transaction it made. A rejected write is the recorded outcome; nothing is silently dropped.

`+ faults` means `SYNC_TEST_POWERSYNC_CONTAINER` is set ([sync guide](../../.agents/sync.md)); the CI `sync` job sets it.

## Platforms

| Platform                          | Proven here                                                                                                                                     | Not proven here                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headless Node (`@powersync/node`) | Protocol, convergence, fault recovery, SQLite query plans                                                                                       | OPFS, multi-tab, shared workers, SQLCipher: Node is a different VFS and cipher                                                                                                         |
| Chromium (web)                    | Offline cold start of the built app (`e2e-offline`)                                                                                             | Storage denied or full, unsupported VFS fallbacks beyond what that spec covers                                                                                                         |
| Firefox, WebKit/Safari            | Nothing: only Chromium is installed on the build machine                                                                                        | Offline shell, service worker lifecycle, OPFS behaviour, timings. Run the offline spec with those browsers before claiming support                                                     |
| Native (iOS, Android)             | Shared logic in `packages/sync` unit tests                                                                                                      | SQLCipher release binary cold start, wrong or missing key, backup restore, runtime mismatch, release-device first sync. Needs a maintainer with a device ([native-dev](native-dev.md)) |
| Postgres server restart           | A full restart is **not** run: the test Postgres may be shared. Cutting all sessions of the database, including the walsender, stands in for it | A real restart (recovery, WAL replay) on a dedicated instance                                                                                                                          |
| Slot `wal_status = lost`          | Dropping the slot and resnapshotting, as the runbook says                                                                                       | The server invalidating a slot by `max_slot_wal_keep_size` (the recovery path is the same)                                                                                             |

The "offline on both platforms" claim is therefore not made: web is proven on Chromium only, native is unproven until a device run.

## Measurements (not gates)

First sync of 1,000 notes of about 200 bytes each into an empty headless Node device, local stack, loaded machine: about 0.2 s from `connect()` to all rows readable (one run; seam 3 prints it as `first sync of 1000 notes: N ms`). Browser and device numbers are not measured; OPFS and SQLCipher are slower than Node's SQLite and the figure must not be reused for them.

Notes list query plan on the product's local schema (1,000 rows):

```
SEARCH ps_data__notes USING INDEX ps_data__notes__notes_live_updated_at_idx (<expr>=?)
USE TEMP B-TREE FOR LAST TERM OF ORDER BY
```

It searches the index, so no table scan or full sort. The temp B-tree is for the `id` tie-breaker only, within equal `updated_at` groups; with `LIMIT` SQLite stops after the page. If that ever shows up in a profile, the first thing to try is declaring the index with descending columns to match `ORDER BY updated_at DESC, id DESC`.

## Still to do by hand

1. Run `apps/web/e2e-offline` under Firefox and WebKit and record the result here.
2. Native release build on a device: cold start offline, wrong key, first sync of a seeded account; record timings.
3. Rehearse the restore and resnapshot drill on a production-like stack ([runbook](../runbooks/sync.md)).
