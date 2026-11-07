# Handoff: local-first sync

For the next agent session implementing [local-first-sync.md](local-first-sync.md). Read the spec and [adversarial review](local-first-sync-review.md) first. D1–D19 remain agreed; review proposals marked CHANGE require maintainer approval, not silent implementation. Resolve the review's readiness gates before starting the build. This file covers the current state, where the code to port lives, verified facts, known pitfalls and the first steps.

## State (2026-11-07)

- No sync build phase is implemented. The review adds `local-first-sync-review.md`, factual/security clarifications to these documents, a Better Auth security patch update, and a localhost-only development Postgres binding preserved by template-init.
- **The repo has no commits.** `main` is unborn and everything is untracked. A feature branch needs a base commit: ask the maintainer to make (or approve) the initial template commit on `main`, then branch `feat/local-first-sync`. Do not commit without that approval.
- Commit attribution and conventional-commit rules: see `AGENTS.md`.

## Facts verified on 2026-11-07

| Fact                                | Value                                                                                                                                            | Consequence                                                                                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@powersync/drizzle-driver`         | 0.8.0, peer `drizzle-orm <1.0.0`                                                                                                                 | Pin tested `drizzle-orm@0.45.4` (and `drizzle-kit` is not needed client-side) directly in `packages/sync/package.json`, not via the catalog (D5)                                                                                                                          |
| Template `drizzle-orm`              | catalog `1.0.0-rc.5`                                                                                                                             | Server untouched. Check that no package imports both `@workspace/db` and `@workspace/sync`                                                                                                                                                                                |
| `@powersync/web`                    | 2.6.0                                                                                                                                            | OPFS VFS on web                                                                                                                                                                                                                                                           |
| `@powersync/react-native`           | 2.4.0, peer `@op-engineering/op-sqlite >=17.1.0 <19.0.0`                                                                                         | SQLCipher is an op-sqlite build flag (`package.json` `op-sqlite.sqlcipher: true`)                                                                                                                                                                                         |
| `@powersync/kysely-driver`          | 2.0.3                                                                                                                                            | Rejected (D5)                                                                                                                                                                                                                                                             |
| `@tanstack/powersync-db-collection` | 1.0.0-rc.1.4                                                                                                                                     | Rejected (D5)                                                                                                                                                                                                                                                             |
| `journeyapps/powersync-service`     | latest tag `1.28.1`                                                                                                                              | Pin the exact tag                                                                                                                                                                                                                                                         |
| Native                              | Expo SDK 58 (lockfile 58.0.23), RN 0.88.1, `expo-dev-client` installed (lockfile 58.0.18), `eas.json` has a `development` profile                | No Expo Go for the selected op-sqlite/SQLCipher stack; rebuild and change the native runtime version before distributing incompatible OTA JS                                                                                                                              |
| Better Auth                         | Updated from vulnerable 1.7.12 to 1.7.18 during review, including core, Drizzle adapter and Expo plugin. **No `jwt()` yet.** User ids are `text` | Critical [Expo advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-4wq4-2ppv-q3hg): rotate the app secret after upgrading if the endpoint was reachable. Generate/inspect the installed JWT plugin schema; do not hand-copy an old `jwks` table |
| Web guard                           | `apps/web/src/routes/_app/route.tsx` calls `requireSession` (network)                                                                            | Replaced by the Device owner guard (D7)                                                                                                                                                                                                                                   |
| Cloudflare path routes              | `/api/*`, `/rpc/*` only (ADR 0005)                                                                                                               | PowerSync goes on `sync.` subdomain (D8)                                                                                                                                                                                                                                  |
| Test harness                        | `packages/api/src/platform/testing/harness.ts`: PGlite + `fromPglite` pg-boss; 12 test files use it after the Expo security regression test      | Phase 3 replaces it (D14)                                                                                                                                                                                                                                                 |
| `notes` table                       | `packages/api/src/notes/tables.ts`: no `deleted_at`                                                                                              | Additive migration in phase 4                                                                                                                                                                                                                                             |
| Dev Postgres                        | `docker-compose.yml`: `postgres:18`, localhost-only port 5432, no `wal_level` flag                                                               | Phase 2 adds logical WAL and a sized retention budget; 4GB is an initial development setting, not a production sizing argument                                                                                                                                            |

Registry recheck: PowerSync versions above still match the registry. `drizzle-orm` stable is 0.45.4, server RC remains 1.0.0-rc.5, and [PR #911](https://github.com/powersync-ja/powersync-js/pull/911) is still open. Pin a tested client patch, not the ambiguous `~0.45` shorthand if an exact pin is intended. `@op-engineering/op-sqlite` latest is **19.0.5**, outside the React Native SDK's peer range: select/test a compatible 18.x release rather than blindly installing latest. Seam 3 also needs `@powersync/node` (1.3.0); shared/react SDK peers must be installed explicitly as required. See the review's complete version report and sources.

## Port map (old repo → template)

Old repo: `~/Workspace/projects/vermillion`. Read in place; adapt to template conventions (oRPC not Hono routes, `packages/env` not varlock, Turbo not Vite+).

| Old                                                                                                                                 | New                                                                                    | Notes                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.yml` (postgres + powersync services, healthcheck, `extra_hosts`)                                                           | `docker-compose.yml`                                                                   | Keep `host.docker.internal:host-gateway` for the JWKS fetch; `compose.linux.yml` (host networking) exists for hosts whose firewall drops container→host traffic                                                           |
| `powersync/service.yaml`                                                                                                            | `powersync/service.yaml`                                                               | `allow_local_jwks: true` in dev only; `sslmode` from env                                                                                                                                                                  |
| `powersync/sync-config.yaml`                                                                                                        | `powersync/sync-config.yaml`                                                           | One `notes` stream, edition 3                                                                                                                                                                                             |
| `powersync/sql/setup-replication.sql`                                                                                               | `powersync/sql/bootstrap.sql`                                                          | Split per D16: roles, storage DB, empty publication owned by the app role. Table adds move to Drizzle migrations                                                                                                          |
| `docker/postgres-init/01-test-database.sql`                                                                                         | test template DB setup                                                                 | For D14 template cloning                                                                                                                                                                                                  |
| `packages/sync/src/{connector,session,device-owner,registry,schema,tables,upload-contract,sync-status,rejection-reasons,logger}.ts` | Client lifecycle in `packages/sync`; wire schemas in runtime-neutral `packages/shared` | Do not port `session.ts` wholesale: it imports exercise search and OTP auth and wipes on expiry. Preserve connector credential-owner checks, adapt oRPC errors, and keep server imports out of the client Drizzle package |
| `apps/api/src/sync/{apply-upload,handlers,rejection}.ts`                                                                            | `packages/api/src/platform/sync/` + `packages/api/src/notes/sync.ts`                   | Handlers call `notes` operations                                                                                                                                                                                          |
| `apps/api/src/sync/schema-parity.test.ts`                                                                                           | `packages/api/src/platform/sync/`                                                      | Extend to publication, stream columns and handlers                                                                                                                                                                        |
| `apps/{web,mobile}/src/powersync/`                                                                                                  | `apps/{web,native}/src/platform/`                                                      | DB factory per platform; explicitly choose/test the web VFS and native SQLCipher setup                                                                                                                                    |
| `apps/web/vite.config.ts` PWA setup and app registration/update handling                                                            | TanStack Start offline-shell integration (design approval required)                    | Missing from the original map: shell, lazy chunks, WASM and workers are required for D7. Do not copy the SPA `/index.html` fallback blindly; exclude `/api/*` and `/rpc/*`                                                |
| `apps/mobile/src/install-crypto.ts`, `polyfills.ts`                                                                                 | `apps/native/src/platform/`                                                            | Hermes has no `crypto`                                                                                                                                                                                                    |
| `tests/sync/01…09*.sync.test.ts`, `session`, `sync-status`, `helpers/`, `global-setup.ts`                                           | seam 3 location (decide: `packages/api/test/sync/` or a `tests/sync` workspace)        | Rewrite against `notes`; skip the exercise/training ones                                                                                                                                                                  |
| `docs/decisions/0004–0012, 0021, 0022`                                                                                              | `docs/adr/0015+`                                                                       | Rewrite per decision in this spec; template ADR format is `# NNNN. Title`, `Status: accepted (date).`, Context / Decision / Consequences                                                                                  |
| `docs/guides/adding-a-synced-table.md`, `mobile-dev.md`                                                                             | `.agents/sync.md` + a guide                                                            | Adapt to the template layout                                                                                                                                                                                              |
| `docs/later.md` sync rows                                                                                                           | spec "Out of scope" table                                                              | Already carried over                                                                                                                                                                                                      |

Additional port inputs missing from the original map:

- `apps/api/src/sync/index.ts` → the two oRPC procedures: account binding, expiry extraction, byte/op limits and response/error mapping live here, not in `apply-upload.ts`.
- `apps/api/src/auth/auth.ts`, `apps/api/src/db/schema/auth.ts`, `apps/api/src/auth/auth.int.test.ts` → JWT configuration, generated current-version schema/migration, and auth tests. Read for intent; do not replace the template's auth setup.
- `apps/web/src/components/update-prompt.tsx` → offline-shell registration/update UX; adapt to i18n and pending-write-safe updates.
- `packages/sync/src/*.test.ts`, `apps/api/src/sync/{upload.int,rejection}.test.ts`, `apps/mobile/src/install-crypto.test.ts` → equivalent current-repo contract/regression tests. Port tests alongside behavior, not only the headless seam 3 suite.

## Pitfalls already paid for (old spike)

- PowerSync stores rows as JSON; an unindexed `ORDER BY` parses every row. Declare a local index on every sort key and check the plan on a device.
- Loading all rows into JS is the cost, not rendering: always `LIMIT` and page.
- `adb reverse --remove` does not cut an open sync stream; kill the app for offline tests.
- Metro started by `expo run:android` in CI mode never picks up edits.
- `withUniwindConfig` must be the outermost Metro wrapper.
- pnpm 12 errors on ignored dependency build scripts under `--frozen-lockfile`: add new native/build deps to `allowBuilds` in `pnpm-workspace.yaml`.
- `auth.user_id()` compares fine with the `user_id` column (verified with uuid; template uses text, simpler).
- `fromClientRow` special-cased columns by name in the old repo; derive boolean/JSON conversion from the sqlite column modes instead (old later.md).

## Open choices the implementer may make (report them)

- Seam 3 location (`tests/sync` workspace vs inside `packages/api`).
- Exact JWT expiry (old: short-lived, renewed by the connector) and slot-lag threshold.
- Port numbers for PowerSync in dev (bind `127.0.0.1`, avoid 3000/3001/8081).

Anything else that is not in the spec: stop and ask the maintainer.

## First steps

Prerequisites omitted from the original recipe: Node 24 (README/CI baseline), pnpm 12.15.0, Docker Compose, dependency installation, and the three app `.env` files from README. Resolve the review's CHANGE proposals first. Do not commit or start a sync phase as part of the review. The current `pnpm db:start` starts only Postgres; bootstrap and PowerSync orchestration do not exist yet. A Postgres publication can only include a table after its migration, so do not activate a `notes` stream before phase 4's table/publication migration succeeds.

1. Confirm the base commit with the maintainer; create `feat/local-first-sync`.
2. Phase 1:

```sh
cd ~/Workspace/collaborations/vermillion && npx skills add powersync-ja/agent-skills
mkdir -p ~/Workspace/collaborations/repos && cd ~/Workspace/collaborations/repos
git clone --depth 1 https://github.com/powersync-ja/powersync-js.git
git clone --depth 1 https://github.com/powersync-ja/powersync-service.git
```

3. Write ADRs 0015+ from the spec decisions; update `AGENTS.md` guide table rows that change (orpc-testing no longer says PGlite after phase 3).
4. Continue only after the review gates and any proposed D18 phase reordering are approved. Pause for the native dev-client rebuild before claiming native proof.

The clone commands above assume those target directories do not exist and network access is available. If they already exist, inspect the remotes and worktree rather than overwriting or recloning. Record the inspected commit SHA; a shallow clone of moving HEAD is not evidence for the pinned production version. Skill installation is interactive and changes repository files; inspect its changes before accepting them.

## Revision log

### 2026-11-07 — adversarial review

- Added the review approval gate and accurate post-review state; no sync phase was started.
- Refreshed registry facts and documented the critical Better Auth patch and conditional secret rotation.
- Flagged op-sqlite 19 incompatibility and missing SDK peers; distinguished installed versions from SDK families.
- Added omitted offline-shell, credential-route, JWT/schema and regression-test port inputs; warned against porting OTP/search/expiry-wipe coupling from the old session module.
- Placed shared upload contracts outside either Drizzle runtime and restored download-account checks.
- Added clean-checkout prerequisites, existing-clone handling, source revision provenance, and table-before-stream startup ordering.
