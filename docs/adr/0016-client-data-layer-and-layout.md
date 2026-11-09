# 0016. Client data layer: isolated Drizzle 0.45, sync package, query vs sync

Status: accepted (2026-11-07). Covers D5, D6, D10, D12. Affected by [0035](0035-remove-notes-example.md): `notes` was removed and `exercise` is the synced reference table.

## Context

`@powersync/drizzle-driver` 0.8.0 peers `drizzle-orm <1.0.0`; the server uses the catalog `1.0.0-rc`. The template keeps one place per vertical for its code and one module-hook seam for data ([data-flow](../../.agents/data-flow.md)).

## Decision

- Clients use `@powersync/drizzle-driver` with a tested `drizzle-orm@0.45` patch pinned only in `packages/sync`, not the catalog. The server stays on the catalog version. No package imports both `@workspace/db` and `@workspace/sync`, except explicit test-only exceptions.
- Runtime-neutral wire and domain schemas live in `@workspace/shared`. Each ORM owns its own table schema. No code generation until parity maintenance hurts.
- Raw typed SQL is allowed for heavy reads. No Kysely, no TanStack DB, no CRDTs.
- Layout: `powersync/` (service config, sync config, bootstrap SQL), `packages/sync` (connector, Session / Device owner, `rejected_writes`, schema assembly, status; per-vertical client files under `src/<vertical>/`), `apps/*/src/platform/` (DB factory per platform), `packages/api/src/platform/sync/` (credentials, upload, registry) and `packages/api/src/<vertical>/sync.ts` (upload handler).
- Module hooks switch from Query to PowerSync. The seam stays; components may change where the data contract requires it (dirty-field forms, see [0019](0019-synced-table-conventions.md)).
- Stays on oRPC + TanStack Query: account, auth, admin, preferences. Synced: user-owned logged data, and later reference catalogs through global streams. Preferences must have cached or default locale behavior and never block opening local data.
- `notes` is the first synced table and the end-to-end proof, deleted once a real vertical exists. Flat notes do not prove parent/child workout invariants; small transaction fixtures cover those without building fitness features.
- Lint boundaries gain the `packages/sync` tree.

## Consequences

- Two schema definitions per synced table, kept honest by the parity test ([0024](0024-test-strategy.md)).
- Revisit Drizzle 1.0 on the client only after a compatible driver is released and tested, not when powersync-js #911 merges.
- Open item, phase 3: where the seam 3 tests live (`packages/api` or a `tests/sync` workspace) and the test-only boundary exception.
