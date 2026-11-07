# 0019. Synced table conventions and conflict rules

Status: accepted (2026-11-07). Covers D11 (amended).

## Context

Synced rows are written on devices, possibly days offline, and merged on the server. The basic conventions came from the earlier spike (`~/Workspace/projects/vermillion`). [the review](../specs/local-first-sync-review.md) found gaps: replay, stale form values, delete races, tombstone retention and schema-version handling.

## Decision

- `id` is a UUIDv7 generated on the client (native needs `expo-crypto`). `user_id` on every user-owned row; streams filter `user_id = auth.user_id()`.
- Soft delete with `deleted_at`; streams exclude deleted rows. A pg-boss job hard-deletes after a retention period tied to the supported maximum offline horizon.
- Conflicts: last upload wins, per field. The UI sends only intentionally changed fields relative to the edit-start baseline (dirty fields), never the newest live row. Same-field order is server application order, not client wall-clock time. Do not generalize per-field merging to counters or ordered children.
- Replay identity and ack-loss behavior: see [0018](0018-upload-protocol.md).
- Delete and update precedence: delete wins over ordinary edits; restore is a separate explicit action; duplicate ids owned by another user are refused; a deleted-while-editing form has a defined outcome. Late writes against purged rows are rejected, not resurrected.
- The upload protocol carries a client schema version. Unknown or unsupported versions are never silently discarded: the queue is kept and the user sees upgrade or recovery guidance. Prefer nullable or defaulted additions; use compatibility adapters when a validator tightens.
- Streams list columns explicitly, never `*`. Postgres `CHECK (length(...))` matches the zod caps (SQL and JS length differ for supplementary Unicode, so test it). Partial index on `(user_id) WHERE deleted_at IS NULL`; a local index on each real sort or filter key, verified with `EXPLAIN QUERY PLAN` on a device.
- Lists are bounded (paged or a bounded live window), ordered with an id tie-breaker and virtualized. UIs show loading, error, first-sync, empty and offline states; a local query failure must not look like "no records".
- Migrations stay additive ([0007](0007-additive-migrations.md)). Production order for a new synced table: migrate (including `ALTER PUBLICATION`) then deploy the sync config then ship clients.

## Consequences

- Open item, phase 1 exit: the supported maximum offline horizon, and from it the tombstone and receipt retention (the spec's 30 days is not final until then).
- Open item, phase 1 exit: schema-version number format and how long old clients stay supported.
- Component and form changes (baseline plus dirty fields) are required in phase 6; swapping the hook alone cannot infer intent.
