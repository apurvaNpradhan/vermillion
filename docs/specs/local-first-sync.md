# Spec: local-first sync with PowerSync

Status: agreed decisions (2026-11-07); implementation readiness blocked by the [adversarial review](local-first-sync-review.md). Numbered decisions are not reversed by that review. Its CHANGE proposals require maintainer approval. Supersedes nothing yet; produces ADRs 0015+ in phase 1.

Vermillion becomes a fitness app (training, macros, body metrics). Every user-logged record must work offline on web and native and sync through Postgres. This spec fixes the sync foundation only. No fitness schema is built here: the `notes` example vertical is the proving table.

Prior art: `~/Workspace/projects/vermillion` (the "old repo") built and measured this stack in a 12-experiment spike (its ADRs 0004–0012, 0021, 0022, read in place under `docs/decisions/`). This spec ports its results into the template's conventions (Turbo, oRPC, TanStack Start, Drizzle 1.0-rc, verticals, module hooks). Do not copy the old repo wholesale: its toolchain (Vite+, Hono RPC, varlock, SPA) differs.

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                               | Why (short)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **PowerSync**, not WatermelonDB                                                                                                                                                                                                                                                                                        | WAL-based downloads without a custom replication engine; uploads still require our backend. SQLite on web and native; Sync Streams; prior spike evidence                                                                                                                                                                                                                                                                                |
| D2  | `npx skills add powersync-ja/agent-skills` in the repo (recorded in `skills-lock.json`). Shallow reference clones of `powersync-ja/powersync-js` and `powersync-ja/powersync-service` in `~/Workspace/collaborations/repos/`, outside the repo                                                                         | Skill for guidance, source for when docs are thin                                                                                                                                                                                                                                                                                                                                                                                       |
| D3  | **Self-hosted PowerSync Open Edition** (`journeyapps/powersync-service` 1.28.x) in dev and prod. Local Docker Postgres in dev. No PowerSync Cloud, no Neon, no MongoDB. Bucket storage in a separate `powersync_storage` database on the same Postgres                                                                 | Fits the existing private Dokploy network and keeps local dev independent of Cloud. Self-hosting adds backup, capacity, upgrades and WAL recovery duties; Cloud also offers private endpoints (availability/pricing must be checked)                                                                                                                                                                                                    |
| D4  | Port the old repo selectively, reading it in place                                                                                                                                                                                                                                                                     | Different toolchain; avoid two architectures                                                                                                                                                                                                                                                                                                                                                                                            |
| D5  | Clients use `@powersync/drizzle-driver` with **`drizzle-orm@0.45` pinned only in `packages/sync`** (not the catalog). Server stays on the catalog `drizzle-orm` 1.0-rc. Raw typed SQL strings allowed for heavy reads (joins, aggregates). Shared zod and domain types in `@workspace/shared`                          | Driver 0.8.0 peers `drizzle-orm <1.0.0` (checked 2026-11-07). Client `sqlite-core` schema is a separate file anyway; no package imports both versions. Kysely needs value conversion; the spike measured TanStack DB's eager mode, but current docs also support on-demand loading. Keep Drizzle to avoid another query/state layer. Revisit after a compatible driver is released and tested, not merely when powersync-js #911 merges |
| D6  | `notes` is the first synced table and the end-to-end proof. Deleted once a real vertical exists                                                                                                                                                                                                                        | Prove the stack on the template before any fitness schema                                                                                                                                                                                                                                                                                                                                                                               |
| D7  | **Offline cold start:** route guards (web `_app`, native `(app)`) trust a local **Device owner** row; the server session is checked in the background. Web calls `navigator.storage.persist()`                                                                                                                         | Today `requireSession` needs the network, so an offline gym shows sign-in                                                                                                                                                                                                                                                                                                                                                               |
| D8  | Prod PowerSync on a **`sync.` subdomain** through Traefik on Dokploy, Cloudflare proxied. The client gets the endpoint from `sync.credentials`, never from a build-time constant                                                                                                                                       | PowerSync auth is a bearer JWT, not cookies, so ADR 0005's same-origin rule does not apply; its `/api/...` paths would collide with the `/api/*` path route                                                                                                                                                                                                                                                                             |
| D9  | Better Auth **`jwt()` plugin** (EdDSA/Ed25519, `kid` + `alg` in header and JWKS, `aud: powersync`, short expiry). PowerSync reads `/api/auth/jwks`. Two oRPC procedures on the `authed` seam: `sync.credentials` → `{ endpoint, token, userId, expiresAt }`, `sync.upload` → applies one client CRUD transaction       | One write path: upload handlers call vertical **operations**, never raw SQL (old ADR 0009)                                                                                                                                                                                                                                                                                                                                              |
| D10 | Layout: see [Layout](#layout)                                                                                                                                                                                                                                                                                          | Keeps "deleting a feature is deleting its vertical"                                                                                                                                                                                                                                                                                                                                                                                     |
| D11 | Data conventions: see [Synced table conventions](#synced-table-conventions)                                                                                                                                                                                                                                            | Old ADR 0011, measured in the spike                                                                                                                                                                                                                                                                                                                                                                                                     |
| D12 | **Stays on oRPC + TanStack Query:** account, auth, admin, preferences (one small row, needed for locale before sync starts). **Synced:** user-owned logged data, and later reference catalogs through global streams                                                                                                   | Sync what must work offline and grows; query what is small or not user-owned                                                                                                                                                                                                                                                                                                                                                            |
| D13 | **Session expiry (401) with local data:** keep the DB, stop uploads, show "sign in again". Same user signs in → resume the queue. Different user → wipe (warn first if writes are pending). Explicit sign-out with unsent writes asks first                                                                            | A workout logged offline must not be lost to an expired session                                                                                                                                                                                                                                                                                                                                                                         |
| D14 | **Drop PGlite.** Every DB-touching test uses Docker Postgres 18, cloning a migrated template database per test file. Add seam 3 (`pnpm test:sync`) and a schema-parity test. Both run in CI                                                                                                                            | PGlite cannot replicate, cannot run publication migrations faithfully, and has one connection (no concurrency tests for `sync.upload`). Docker is required by seam 3 anyway                                                                                                                                                                                                                                                             |
| D15 | **Local encryption:** SQLCipher (op-sqlite) on native from day one, key in SecureStore. Web: an optional `encryptionKey` wired through the DB factory, off                                                                                                                                                             | Health data. A browser has no safe key store. Only acknowledged replicated rows are disposable: pending writes, rejected payloads and local-only state must survive any encryption migration                                                                                                                                                                                                                                            |
| D16 | **Replication setup split:** a one-time privileged bootstrap SQL, then per-table `ALTER PUBLICATION` and `GRANT` inside normal Drizzle migrations. The API role never needs superuser, `CREATEROLE` or `REPLICATION`                                                                                                   | The app role owns tables and the publication, so it can add tables itself                                                                                                                                                                                                                                                                                                                                                               |
| D17 | Observability ships with the setup: a sync diagnostics screen, a replication-slot lag job, the PowerSync readiness probe in Dokploy                                                                                                                                                                                    | A stopped PowerSync service silently fills the disk with WAL                                                                                                                                                                                                                                                                                                                                                                            |
| D18 | Build in the [phases](#phases) below on a feature branch                                                                                                                                                                                                                                                               |                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D19 | **No end-to-end encryption.** The server reads user data, so search (pg_trgm, tsvector, pgvector), AI agents and an MCP server work through Postgres and vertical operations; their writes reach devices through sync. Before public launch: explicit consent (GDPR Art. 9 health data), data export, account deletion | E2E conflicts with the intended plaintext server search, agents and validation; client-side export remains possible with E2E                                                                                                                                                                                                                                                                                                            |

## Architecture

```
 web / native                            Dokploy (private network)
 ┌──────────────────────┐  /rpc, /api   ┌──────────────────────────────────┐
 │ components           │──────────────►│ server: Hono + oRPC + Better Auth│
 │  └ module hooks      │               │  /api/auth/jwks                  │
 │     ├ Query (oRPC)   │               │  sync.credentials → { endpoint,  │
 │     └ PowerSync      │               │           token, userId,         │
 │                      │               │           expiresAt }            │
 │        useQuery      │               │  sync.upload → registry →        │
 │  local SQLite        │               │     vertical operations          │
 │  (OPFS / op-sqlite   │   sync.<dom>  │ powersync-service ◄── WAL ── PG  │
 │   + SQLCipher)       │◄─────────────►│   bucket storage: powersync_     │
 └──────────────────────┘   stream      │   storage DB on the same PG      │
                                        └──────────────────────────────────┘
```

Reads: local SQLite through PowerSync `useQuery` (live). Writes: local SQLite, then the upload queue → `sync.upload` → one Postgres transaction → WAL → PowerSync → every device.

**Credential isolation (security correction):** before connecting or refreshing, compare the authenticated `userId` returned by `sync.credentials` with the database's Device owner and the current session generation. Never connect another user's stream to an existing owner's database. Reject stale async completions after sign-out/account switch. `expiresAt` must reflect the JWT expiry. These checks preserve the old connector's protection; the upload account check alone does not protect downloads.

## Layout

| Where                                                 | What                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `powersync/`                                          | `service.yaml` (`_type: self-hosted`, env-driven), `sync-config.yaml` (Sync Streams, `config: edition: 3`), `sql/bootstrap.sql`                                        |
| `docker-compose.yml`                                  | Postgres 18 with `wal_level=logical`, `max_slot_wal_keep_size=4GB`; `powersync` service bound to `127.0.0.1`                                                           |
| `packages/sync`                                       | Client infrastructure: connector, Session / Device owner, `rejected_writes`, schema assembly (`DrizzleAppSchema`), sync status. The only `drizzle-orm@0.45` dependency |
| `packages/sync/src/<vertical>/`                       | A vertical's client side: `sqlite-core` table, `queries.ts`, `writes.ts`, exported through that folder's `index.ts`                                                    |
| `apps/web/src/platform/`, `apps/native/src/platform/` | The DB factory per platform: `@powersync/web` (OPFS) and `@powersync/react-native` (op-sqlite + SQLCipher)                                                             |
| `apps/*/src/<vertical>/use-*.ts`                      | Module hooks switch from Query to PowerSync. Components do not change                                                                                                  |
| `packages/api/src/platform/sync/`                     | `sync.credentials`, `sync.upload`, the upload contract, the handler registry, the slot-lag job                                                                         |
| `packages/api/src/<vertical>/sync.ts`                 | The vertical's upload handler: translates a CRUD op and calls the vertical's operations; registered with the platform registry                                         |

## Synced table conventions

- `id`: UUIDv7 generated on the client (template column helper). Native needs `expo-crypto` (Hermes has no `crypto`).
- `user_id` on every user-owned row; streams filter `user_id = auth.user_id()`.
- **Soft delete** with `deleted_at`; streams exclude deleted rows; a pg-boss job hard-deletes after 30 days. Retried hard DELETEs cause spurious rejected writes.
- Conflicts: **last upload wins, per field** (`PATCH` merges fields).
- Streams list columns explicitly, never `*`. `updated_at` stays server-side unless a screen needs it.
- Postgres `CHECK (length(...))` matching the zod caps, so a direct write cannot bypass them.
- Postgres partial index on `(user_id) WHERE deleted_at IS NULL`; a local index on every list sort key (declared on the Drizzle sqlite table). Verify plans with `EXPLAIN QUERY PLAN` on a device, not only in Node.
- Lists are paged (`LIMIT`, load more near the end) and virtualized (TanStack Virtual on web, FlashList on native). Rows are memoized by identity.
- Migrations stay additive (ADR 0007). Production order for a new synced table: migrate (includes `ALTER PUBLICATION`) → deploy the sync config → ship clients.

## Upload semantics (port old ADR 0008)

- One client CRUD transaction → one Postgres transaction, operations dispatched through a table allowlist.
- The upload names the account it was queued for; a different session gets `409 SYNC_WRONG_ACCOUNT` and the writes stay queued.
- Permanent failures (validation, authorization, oversize) become **Rejected writes** in a local-only `rejected_writes` table; the local row reverts; the queue never blocks. Temporary failures retry.
- A permanently bad op rolls back its whole client transaction; each reverted sibling is reported as `SYNC_TRANSACTION_ROLLED_BACK`.

## Replication setup (D16)

**Bootstrap** (idempotent, run with an admin URL; by `pnpm db:start` in dev, a one-shot Dokploy job in prod):

- role `powersync_replication` `LOGIN REPLICATION`
- database `powersync_storage` with its own role
- publication `powersync` (empty, owned by the app role)

**Per synced table**, in a custom Drizzle migration:

```sql
ALTER PUBLICATION powersync ADD TABLE notes;
GRANT SELECT ON notes TO powersync_replication;
```

## Testing (D14)

| Seam                | Runs                                                                   | Database                                  |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| unit                | pure functions                                                         | none                                      |
| 1 (API, in-process) | oRPC router → operations → Drizzle                                     | Docker PG 18, template DB cloned per file |
| 2 (e2e)             | Playwright → web → server                                              | Docker PG 18                              |
| 3 (sync, new)       | headless `@powersync/node` clients ⇄ `powersync-service` ⇄ server ⇄ PG | Docker PG 18 (logical WAL) + PowerSync    |
| parity              | pg-core ↔ sqlite-core ↔ publication ↔ stream columns ↔ upload handlers | migrated test DB + config files           |

Seam 3 covers the old spike's experiments 1–9 on `notes`: type round trip, offline both ways, different fields, same field (last upload wins), soft delete, rejection, server write appears live, auth (renewal, user switch, revocation, D13 lock-and-resume), additive migration with an old client. Plus stream isolation between users.

CI: Postgres and `powersync-service` as service containers; `pnpm test` and `pnpm test:sync` both run. `pnpm test` without Postgres fails with a message that says to run `pnpm db:start`.

## Observability (D17)

- **Sync diagnostics** (settings, web and native): connection state, last synced, upload queue length, rejected writes with retry/discard.
- **Slot lag job:** pg-boss, every 5 minutes, reads `pg_replication_slots`, logs lag through `@workspace/logger`, marks `/health` degraded above a threshold.
- PowerSync readiness probe (`/probes/readiness`) as the Dokploy health check.

## Phases

Each phase ends green on `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm i18n:check`, then a conventional commit on the feature branch.

1. **Prep:** `npx skills add powersync-ja/agent-skills`; shallow clones into `~/Workspace/collaborations/repos/`; ADRs 0015+ written from this spec.
2. **Infra:** compose (Postgres logical WAL, `powersync-service` 1.28.x), `bootstrap.sql`, `service.yaml`, `sync-config.yaml` with the `notes` stream; `.env` entries through `packages/env`.
3. **Tests:** replace the PGlite harness with Docker Postgres + template-DB cloning (`fromPglite` for pg-boss goes too); the existing suite green; update `.agents/orpc-testing.md`.
4. **Server:** `jwt()` plugin and JWKS; `sync.credentials`; `sync.upload` with registry, account check, rejected-write errors; `notes`: `deleted_at`, CHECKs, partial index, publication migration, upload handler.
5. **Client:** `packages/sync` (Drizzle 0.45), web DB factory (OPFS), native (op-sqlite + SQLCipher, `expo-crypto`); `use-notes` swapped to PowerSync on both. **Pause here:** native needs a dev-client rebuild on the maintainer's phone.
6. **Offline:** Device owner guards on web and native; lock-and-resume on 401; sign-out confirmation with unsent writes; `navigator.storage.persist()`.
7. **Prove:** seam 3 suite and parity test; CI job.
8. **Ops and docs:** diagnostics screen (i18n `en` + `de`), slot lag job, `.agents/sync.md`, an "adding a synced table" guide, `docs/deployment.md` (sync subdomain, bootstrap job, Postgres flags), CONTEXT.md glossary (Device owner, Rejected write, Sync stream, Bootstrap).

## Review gates before implementation continues

See [local-first-sync-review.md](local-first-sync-review.md) for evidence, severity, alternatives and approval proposals. These are unresolved requirements, not approval for a new build phase or reversal of D1–D19.

- D7 needs an offline web shell, lazy chunks, SQLite WASM and workers, not just a local guard. The old SPA service worker cannot be copied unchanged into TanStack Start. Never cache auth/RPC responses. Test a built app after closing it, not only an already loaded tab.
- Uploads need a specified replay identity and commit/ack-loss behavior. Repeated PATCH must not overwrite a later device's edit after already committing. Define delete/update races, tombstone retention versus maximum offline duration, and unknown-client-schema handling.
- Rejected writes need enough local payload to inspect/edit/retry after checkpoint reconciliation. Save it durably before acknowledging; test crashes between those steps. Never log payloads. Retry creates a new validated local transaction.
- Per-field merge requires dirty-field writes from the UI. Current note forms submit both fields; swapping only the hook cannot infer intent reliably from the latest replicated row.
- Device owner is local identity, not server authorization. Specify offline access versus reauthentication lock, deletion versus expiry, multi-tab switching, and the bounded JWT revocation window. Never auto-wipe on transport errors or expired credentials.
- Bootstrap needs explicit ownership and CONNECT/USAGE grants, preflight checks, concurrent-run exclusion, resumable failure handling and a restore procedure. `CREATE DATABASE` cannot share one transaction with all setup. Reruns must not reset publication membership.
- Slot monitoring needs external alerts, disk/headroom and invalidation monitoring, and a recovery drill. `max_slot_wal_keep_size=4GB` is not a hard disk cap or recovery plan. Keep liveness separate from dependency readiness; the current API probe is `/api/health`, not `/health`.
- Introduce minimum sync correctness tests, auth isolation and operational probes alongside implementation rather than leaving them all to phases 7–8. The revised order in the review awaits approval (D18).
- Parity must check explicit mappings, types, null/default semantics, local-only exclusions, publication membership, handlers, ownership and actual installed indexes. Source declarations alone are insufficient. Enforce the new sync vertical boundary in lint.
- Native key loss, backup/restore, reinstall, SQLCipher opening and native runtime/OTA compatibility need device tests before real health data. Destructive resync is unsafe while unsent or rejected work exists.

## Out of scope / deferred

| Item                                                             | Revisit when                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| Any fitness schema (training, macros, metrics)                   | This spec's phases pass                                |
| Food data (server search on USDA FDC + Open Food Facts)          | Macro tracking; its own grilling                       |
| Web encryption at rest                                           | A safe key strategy for the web                        |
| Audit log (`actor` on operations)                                | The first AI agent or MCP                              |
| MCP server auth (Better Auth `oauth-provider`)                   | The first external client                              |
| Safari timings, phone release-build cold start, phone first-sync | Before public launch                                   |
| Consent, data export, account deletion UI (D19)                  | Before public launch                                   |
| Drizzle 1.0 on the client                                        | Compatible driver release plus parity/round-trip tests |

## Revision log

### 2026-11-07 — adversarial review

- Linked the review and recorded unresolved implementation gates without accepting decision reversals.
- Corrected D1/D3/D5 rationales: custom uploads still exist, Cloud private endpoints exist, and TanStack DB has on-demand loading. The selected stack is unchanged.
- Restored credential account identity/expiry and download-owner checks omitted from the handoff of the old connector (security correction to D9).
- Corrected the destructive-resync claim in D15: unsent/local-only state is not a disposable replica.
- Corrected D19's claim about export under E2E; kept the no-E2E decision.
- Require a released/tested Drizzle-compatible driver rather than treating a merged PR as compatibility.
