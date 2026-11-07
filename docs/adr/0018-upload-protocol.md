# 0018. Upload protocol: one transaction, durable replay identity, rejected writes

Status: accepted (2026-11-07). Covers the upload half of D9 and the replay requirement of D11 (amended).

## Context

PowerSync uploads are at-least-once. If a transaction commits but its response is lost, a retry after another device's edit would overwrite that edit again. The earlier spike (`~/Workspace/projects/vermillion`) keyed nothing on replay and stored rejected writes without their payload, so retry had nothing to replay.

## Decision

- One client CRUD transaction becomes one Postgres transaction, dispatched through a table allowlist to vertical operations. Operations accept validated client ids and the caller's transaction handle.
- Each upload carries a durable replay identity (stable account, install and transaction identity plus a request digest). The server stores the outcome atomically with the transaction, serializes concurrent duplicates, and returns the same outcome after ack loss. Reusing an identity with a different payload is refused. Receipt retention is tied to the supported offline horizon ([0019](0019-synced-table-conventions.md)).
- The upload names the account it was queued for; a different session gets `409 SYNC_WRONG_ACCOUNT` and the writes stay queued.
- A closed outcome table: success, durable whole-transaction rejection, session lock, wrong account, incompatible client, rate-limit backoff, transient failure. Recommended default, confirmed in phase 4: only the first failing op is reported with its code; each reverted sibling gets `SYNC_TRANSACTION_ROLLED_BACK`. Status codes and error names here are provisional until phase 4. Permanent failures become Rejected writes; temporary ones retry. Known constraint violations are inspected, not all database data errors treated as permanent.
- Byte, op and field limits are validated before expensive work and mirrored on local writes. No silent splitting of an atomic transaction.
- Rejected writes are stored in a local-only `rejected_writes` table with transaction identity, op ordinal, schema version and a bounded original payload, saved durably before the transaction is completed. Recording is deduplicated. Retry creates a new validated local transaction after user review. Payloads never go to logs. Discard and retention are explicit.

## Consequences

- Open item, phase 1 exit / phase 4: replay-identity wire format and digest, receipt storage and retention, size and op limits.
- Open item, phase 4: confirm first-failure reporting (the recommended default, simpler) against one savepoint per operation ([the review](../specs/local-first-sync-review.md) favors first-failure if approved), and the exact status codes.
- Crash windows (after response, after rejection storage, before completion) and ack loss need tests from phase 4/5; see [0024](0024-test-strategy.md).
