# 0015. PowerSync, self-hosted, as the sync engine

Status: accepted (2026-11-07). Covers D1, D2, D3, D4 of the [sync spec](../specs/local-first-sync.md).

## Context

The app will become a fitness app. User-logged records must work offline on web and native and sync through Postgres. An earlier spike in a separate repository measured PowerSync on this need; that evidence is historical, not a run against this template.

## Decision

- PowerSync replicates Postgres to local SQLite on web and native. It removes the custom download engine, not the upload backend: uploads stay our own code (see [0018](0018-upload-protocol.md)).
- Self-hosted PowerSync Open Edition (`journeyapps/powersync-service`, pinned to an exact 1.28.x tag) in dev and prod, on the existing Postgres and private Dokploy network. Bucket storage lives in a separate `powersync_storage` database on the same Postgres server. No PowerSync Cloud, Neon or MongoDB.
- Development aids: the `powersync` agent skill and shallow reference clones of `powersync-js` and `powersync-service` outside the repo. They guide, they are not API authority. Record the inspected SHAs.
- Port the old spike selectively, reading it in place. Its toolchain (Vite+, Hono RPC, SPA) differs, and its session code is coupled to features this template lacks.

Alternatives considered and not chosen: WatermelonDB (custom pull/push on our side), Electric (offline writes remain our work), Zero (not designed for long offline periods), RxDB, and a custom SQLite sync.

## Consequences

- We take on backup, capacity, upgrade and WAL-recovery duties for the service. A shared Postgres server is a shared failure domain. PowerSync Cloud (including private endpoints) is the fallback if nobody owns that work.
- Upgrades to the service image are deliberate; pin the tag and consider a digest.
- Open item, phase 2: whether to pin by digest.
