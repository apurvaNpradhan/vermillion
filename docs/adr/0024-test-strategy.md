# 0024. Tests: real Postgres everywhere, a sync seam and a parity test

Status: accepted (2026-11-07). Covers D14. Affected by [0035](0035-remove-notes-example.md): the sync scenarios now run on Custom exercises instead of notes.

## Context

PGlite cannot replicate, cannot run publication migrations faithfully and has one connection, so it cannot test concurrent `sync.upload`. Docker is required by the sync tests anyway. [The review](../specs/local-first-sync-review.md) also found that proof arrived too late in the old order and that headless Node cannot prove platform behavior.

## Decision

- Drop PGlite and its `fromPglite` pg-boss adapter. Every DB-touching test uses Docker Postgres 18, cloning an immutable migrated template database per test file, with explicit role and slot cleanup. Existing actual test isolation is kept.
- Seams: unit; seam 1 (router in-process on Postgres); seam 2 (Playwright e2e); new seam 3 (`pnpm test:sync`: headless `@powersync/node` clients, `powersync-service`, server, Postgres); and a parity test.
- Parity checks explicit mappings, types, null and default semantics, local-only exclusions, publication membership, stream columns, upload handlers, ownership and the indexes actually installed in SQLite, not only source declarations. Value conversion (null vs empty, booleans, JSON, Unicode length, timezone, numeric precision) is round-trip tested.
- Fault injection sits at transport and storage boundaries, not mocks of our own operations.
- Required acceptance tests (review section 5, plus stream isolation between users from the [spec](../specs/local-first-sync.md#testing-d14)):
  - A's committed transaction response is lost; B edits; retry of A must not overwrite B or duplicate effects.
  - Crash after rejection persistence and before completion; restart preserves one recoverable rejection and advances the queue correctly.
  - Two real note forms edit different fields; both survive; same-field order is server application order, not client wall-clock time.
  - Cookie or account switch while credentials, upload or revalidation are in flight, with two tabs and an open shared worker.
  - Session expiry with unsent data; same-user resume; wrong-user block; sign-out cancel and confirm; confirmed deletion.
  - Late update and create against deleted or purged rows; duplicate ids owned by another user; transaction rollback siblings.
  - Old queued writes across nullable or defaulted additions and changed validators; an unknown schema version does not silently discard.
  - Built-browser cold restart and deep link offline, cache update, storage denial or full, unsupported VFS and worker asset failure.
  - SQLCipher release binary cold start, incorrect or missing key, backup restore, runtime mismatch and release-device first sync.
  - Restart PowerSync and Postgres, deliberately invalidate a test slot, restore or resnapshot, and verify convergence and pending-write preservation.
  - Stream isolation between users.
- Headless tests do not prove OPFS, multi-tab or SQLCipher behavior; those need browser and device tests. "Offline on both platforms" is not claimed from Node tests.
- CI runs Postgres and `powersync-service` as service containers; `pnpm test` and `pnpm test:sync` both run. `pnpm test` without Postgres fails and says to run `pnpm db:start`.

## Consequences

- From phase 3 this supersedes the PGlite guidance in `.agents/orpc-testing.md` and the AGENTS.md orpc-testing row; both are updated in phase 3, not before.
- Open item, phase 3: template cloning details and connection cleanup; diagnosing the existing 10-second startup subprocess test timeout before changing it.
- A minimal real-service smoke and parity fixture exist from phase 3; they grow each phase.
