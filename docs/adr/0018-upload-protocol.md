# 0018. Upload protocol: one transaction, durable replay identity, rejected writes

Status: accepted (2026-11-07). Covers the upload half of D9 and the replay requirement of D11 (amended).

## Context

PowerSync uploads are at-least-once. If a transaction commits but its response is lost, a retry after another device's edit would overwrite that edit again. The earlier spike (`~/Workspace/projects/vermillion`) keyed nothing on replay and stored rejected writes without their payload, so retry had nothing to replay.

## Decision

- One client CRUD transaction becomes one Postgres transaction, dispatched through a table allowlist to vertical operations. Operations accept validated client ids and the caller's transaction handle.
- Each upload carries a durable replay identity, settled by the maintainer on 2026-11-07:
  - Key: `(user_id, install_id, tx_id)` plus a digest. `install_id` is a UUIDv7 generated when the local database is created and stored in a local-only table; a wiped database gets a new `install_id`. `tx_id` is PowerSync's `CrudTransaction.transactionId` (a per-database autoincrement).
  - `digest` is the sha256 of the canonical JSON of the ops (`op`, `table`, `id`, `opData`).
  - The server receipt table has primary key `(user_id, install_id, tx_id)` and stores the digest and the outcome. The receipt is inserted in the same Postgres transaction as the writes, so concurrent duplicates block on the primary key.
  - Same key and same digest: return the stored outcome. Same key and a different digest: `409` refusal.
  - Receipts are retained 120 days ([0019](0019-synced-table-conventions.md)).
- The upload names the account it was queued for; a different session gets `409 SYNC_WRONG_ACCOUNT` and the writes stay queued.
- A closed outcome table: success, durable whole-transaction rejection, session lock, wrong account, incompatible client (`SYNC_CLIENT_INCOMPATIBLE`, [0019](0019-synced-table-conventions.md)), rate-limit backoff, transient failure. Recommended default, confirmed in phase 4: only the first failing op is reported with its code; each reverted sibling gets `SYNC_TRANSACTION_ROLLED_BACK`. Status codes and error names here are provisional until phase 4. Permanent failures become Rejected writes; temporary ones retry. Known constraint violations are inspected, not all database data errors treated as permanent.
- Byte, op and field limits are validated before expensive work and mirrored on local writes. No silent splitting of an atomic transaction.
- Rejected writes are stored in a local-only `rejected_writes` table with transaction identity, op ordinal, schema version and a bounded original payload, saved durably before the transaction is completed. Recording is deduplicated. Retry creates a new validated local transaction after user review. Payloads never go to logs. Discard and retention are explicit.

## Consequences

- Settled in phase 4: limits are 100 ops, 32 fields per op, 64-character names and ids, 64 KiB per string value and 512 KiB of canonical JSON per transaction (`SYNC_LIMITS` in `packages/shared`), checked before any database work (an oversize transaction is a durable-by-determinism `rejected` result, not stored); the HTTP body is capped at 1 MiB. Receipt table `sync_upload_receipts`: `user_id`, `install_id`, `tx_id` (primary key), `digest`, `outcome` (jsonb), `created_at`; the claim is inserted first in the upload transaction, the outcome is written last, and a concurrent duplicate blocks on the key.
- Settled in phase 4: first-failure reporting. Operations run in one savepoint; the first failure rolls them all back and the receipt (outcome `rejected`) commits. The result carries `code`, `failedIndex` and a per-op `ops` array with `SYNC_TRANSACTION_ROLLED_BACK` for the rest. Per-op savepoints were not needed.
- Status codes: applied and rejected are 200 results. Refusals use error `data.code`: `SYNC_WRONG_ACCOUNT` and `SYNC_REPLAY_MISMATCH` 409, `SYNC_CLIENT_INCOMPATIBLE` and `SYNC_INVALID_REQUEST` (digest does not match) 400, `SYNC_RATE_LIMITED` 429, `SYNC_TRANSIENT` 502. Permanent per-op codes: `SYNC_UNKNOWN_TABLE`, `SYNC_INVALID_OP`, `SYNC_LIMIT_EXCEEDED`, `SYNC_ROW_NOT_FOUND`, `SYNC_ROW_DELETED`, `SYNC_ID_CONFLICT`, `SYNC_CONSTRAINT_VIOLATION`. Postgres 23505 maps to id conflict, 23502/23503/23514 to constraint violation, 22001/22021/22P05/22P02 to invalid op; every other database error is transient.
- Settled in phase 4: DELETE is idempotent and never discloses ownership (a missing, foreign or deleted note is a no-op); PUT over one's own live note replaces its fields; PUT or PATCH on a tombstone is `SYNC_ROW_DELETED`; on a missing, foreign or purged row `SYNC_ROW_NOT_FOUND`. A `sync.purge` pg-boss job (daily) hard-deletes tombstones and receipts older than 120 days.
- Open item, phase 4: confirm first-failure reporting (the recommended default, simpler) against one savepoint per operation ([the review](../specs/local-first-sync-review.md) favors first-failure if approved), and the exact status codes.
- Crash windows (after response, after rejection storage, before completion) and ack loss need tests from phase 4/5; see [0024](0024-test-strategy.md).
