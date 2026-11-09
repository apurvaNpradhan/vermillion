# 0019. Synced table conventions and conflict rules

Status: accepted (2026-11-07). Covers D11 (amended). Affected by [0035](0035-remove-notes-example.md): `notes` was removed; its tombstone and purge rules stay as the design for user-deletable rows, and `exercise` is the worked example.

## Context

Synced rows are written on devices, possibly days offline, and merged on the server. The basic conventions came from the earlier spike (`~/Workspace/projects/vermillion`). [the review](../specs/local-first-sync-review.md) found gaps: replay, stale form values, delete races, tombstone retention and schema-version handling.

## Decision

- `id` is a UUIDv7 generated on the client (native needs `expo-crypto`). `user_id` on every user-owned row; streams filter `user_id = auth.user_id()`.
- Soft delete with `deleted_at`; streams exclude deleted rows. A pg-boss job hard-deletes after a retention period tied to the supported maximum offline horizon.
- Conflicts: last upload wins, per field. The UI sends only intentionally changed fields relative to the edit-start baseline (dirty fields), never the newest live row. Same-field order is server application order, not client wall-clock time. Do not generalize per-field merging to counters or ordered children.
- Replay identity and ack-loss behavior: see [0018](0018-upload-protocol.md).
- Delete and update precedence: delete wins over ordinary edits; restore is a separate explicit action; duplicate ids owned by another user are refused; a deleted-while-editing form has a defined outcome. Late writes against purged rows are rejected, not resurrected.
- Offline horizon (settled 2026-11-07): 90 days supported. Tombstones and upload receipts are retained 120 days. Purging a note atomically replaces its tombstone with a `deleted_note_ids` marker (UUID and owner only, no content), retained until account deletion. This prevents a lost-ack PUT from resurrecting the note after both payload and receipt retention expire. Markers are not replicated. Beyond the horizon uploads are still attempted; edits to purged rows become recoverable Rejected writes.
- Schema version (settled 2026-11-07): an integer `SYNC_SCHEMA_VERSION` constant in `packages/shared`, sent with every upload. The server accepts `MIN..CURRENT`; outside that range it answers `SYNC_CLIENT_INCOMPATIBLE`: the queue is paused, writes are kept and the app shows an update prompt. Never raise `MIN` above a version released within the last 90 days. Unknown or unsupported versions are never silently discarded. Prefer nullable or defaulted additions; use compatibility adapters when a validator tightens.
- Streams list columns explicitly, never `*`. Postgres `CHECK (length(...))` matches the zod caps (SQL and JS length differ for supplementary Unicode, so test it). Partial index on `(user_id) WHERE deleted_at IS NULL`; a local index on each real sort or filter key, verified with `EXPLAIN QUERY PLAN` on a device.
- Lists are bounded (paged or a bounded live window), ordered with an id tie-breaker and virtualized. UIs show loading, error, first-sync, empty and offline states; a local query failure must not look like "no records".
- Migrations stay additive ([0007](0007-additive-migrations.md)). Production order for a new synced table: migrate (including `ALTER PUBLICATION`) then deploy the sync config then ship clients.

## Consequences

- Component and form changes (baseline plus dirty fields) are required in phase 6; swapping the hook alone cannot infer intent.
- Settled in phase 6: an edit form keeps a baseline per field; untouched fields follow the live row, edited fields keep the user's text. A note deleted while its form is open shows a notice with "save as new note" (a fresh row, never a restore) or "discard changes". Retrying a rejected create makes a new row; a rejected edit patches the note, or is saved as a new note when it is gone; a rejected delete is repeated. Rejected entries are kept until retried or discarded.
