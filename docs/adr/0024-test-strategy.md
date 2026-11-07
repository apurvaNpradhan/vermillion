# 0024. Tests: real Postgres everywhere, a sync seam and a parity test

Status: accepted (2026-11-07). Covers D14.

## Context

PGlite cannot replicate, cannot run publication migrations faithfully and has one connection, so it cannot test concurrent `sync.upload`. Docker is required by the sync tests anyway. The review also found that proof arrived too late in the old order and that headless Node cannot prove platform behavior.

## Decision

- Drop PGlite and its `fromPglite` pg-boss adapter. Every DB-touching test uses Docker Postgres 18, cloning an immutable migrated template database per test file, with explicit role and slot cleanup. Existing actual test isolation is kept.
- Seams: unit; seam 1 (router in-process on Postgres); seam 2 (Playwright e2e); new seam 3 (`pnpm test:sync`: headless `@powersync/node` clients, `powersync-service`, server, Postgres); and a parity test.
- Parity checks explicit mappings, types, null and default semantics, local-only exclusions, publication membership, stream columns, upload handlers, ownership and the indexes actually installed in SQLite, not only source declarations. Value conversion (null vs empty, booleans, JSON, Unicode length, timezone, numeric precision) is round-trip tested.
- Fault injection sits at transport and storage boundaries, not mocks of our own operations.
- Required acceptance tests (from the review): ack loss then another device's edit then retry; crash between rejection storage and completion; two forms editing different fields; account switch with in-flight work across tabs; expiry with unsent data; late update or create against deleted or purged rows; old queued writes across schema changes; built-browser cold restart; SQLCipher release binary; PowerSync or Postgres restart, slot invalidation and resnapshot with pending writes preserved.
- Headless tests do not prove OPFS, multi-tab or SQLCipher behavior; those need browser and device tests. "Offline on both platforms" is not claimed from Node tests.
- CI runs Postgres and `powersync-service` as service containers; `pnpm test` and `pnpm test:sync` both run. `pnpm test` without Postgres fails and says to run `pnpm db:start`.

## Consequences

- `.agents/orpc-testing.md` and the AGENTS.md row change when phase 3 lands, not before.
- Open item, phase 3: template cloning details and connection cleanup; diagnosing the existing 10-second startup subprocess test timeout before changing it.
- A minimal real-service smoke and parity fixture exist from phase 3; they grow each phase.
