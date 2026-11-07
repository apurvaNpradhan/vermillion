# Testing

| What                                 | Where                                 | Run                                                         |
| ------------------------------------ | ------------------------------------- | ----------------------------------------------------------- |
| API behaviour (seam 1)               | `packages/api/src/**/*.test.ts`       | `pnpm test` (needs `pnpm db:start`)                         |
| Pure functions with many edge cases  | next to the code (`*.test.ts`)        | `pnpm test`                                                 |
| Sync infrastructure on real Postgres | `packages/api/src/**/*.infra.test.ts` | `pnpm test:sync-infra` (skips without the compose Postgres) |
| Sync seam 3 (real services)          | `tests/sync/src/**/*.test.ts`         | `pnpm test:sync` (Postgres, PowerSync and the API running)  |
| Repo tooling                         | `scripts/**/*.test.mjs`, `tools/**`   | `pnpm test` (root project)                                  |
| Browser flows (seam 2)               | `apps/web/e2e/*.spec.ts`              | `pnpm test:e2e`                                             |
| Offline shell on the built app       | `apps/web/e2e-offline/*.spec.ts`      | `pnpm --filter web test:e2e:offline` (no API or Postgres)   |

Good tests exercise external behaviour through the highest seam and survive refactoring: splitting files or swapping a library behind a seam must not break them. Do not mock our own modules. Test-only environment overrides (`TEST_DATABASE_ADMIN_URL`, `SYNC_INFRA_TEST_ADMIN_URL`, `E2E_DATABASE_URL`, `SYNC_TEST_DATABASE_URL`, `SYNC_TEST_POWERSYNC_URL`, `SYNC_TEST_POWERSYNC_CONTAINER`, `SYNC_TEST_API_URL`) are read straight from `process.env` in test and Playwright files; that is the one exemption from the `packages/env` rule. Do not assert on internals.

`pnpm test` and `pnpm test:sync-infra` use the Docker Postgres (default `postgresql://postgres:password@127.0.0.1:5432/postgres`, override with `TEST_DATABASE_ADMIN_URL`; the role needs CREATEDB). `pnpm test` fails with a `pnpm db:start` hint if it is missing; only the `*.infra.test.ts` files skip. Details of the template and clones: [orpc-testing](orpc-testing.md).

`tests/sync` is its own workspace because seam 3 imports both server-side and client-side packages, which ADR 0016 forbids for an ordinary package. It is not part of `pnpm test`. `pnpm test:sync` first checks Postgres, PowerSync readiness (`127.0.0.1:8090`) and the API (`127.0.0.1:3000`, which serves PowerSync's JWKS) and names whatever is missing. The notes tests drive headless `@powersync/node` clients with a test-local connector that implements the `sync.credentials` / `sync.upload` contract.

Seam 3 runs against the dev stack, not a cloned database: PowerSync replicates from the one database it is configured for, and fetches the JWKS of the API on port 3000, so the API under test must use that same database. Isolation is by data: every test registers its own users through the real auth API (the verification email is not clicked; the address is marked verified in SQL) and uses fresh UUIDv7 ids, so nothing is cleaned up. Files run one at a time; the fault suite (`faults.test.ts`) stops PowerSync, cuts database sessions and drops the replication slot, so it is skipped unless `SYNC_TEST_POWERSYNC_CONTAINER` names the container (see [sync](sync.md)). Overrides: `SYNC_TEST_DATABASE_URL` (the replicated database), `SYNC_TEST_POWERSYNC_URL`, `SYNC_TEST_API_URL`, `SYNC_TEST_APP_ORIGIN` (the API's `APP_URL`). Start order after a new synced-table migration: bootstrap, API (migrates), then PowerSync, as the CI `sync` job does. On hosts whose firewall blocks the Docker bridge from reaching the host, PowerSync cannot fetch the JWKS (the error is `PSYNC_S2204`); use `compose.linux.yml` (PowerSync on the host network) for local checks.

The Postgres test template gets the `powersync` publication and the `powersync_replication` role from `provisionReplicationFixture` (`platform/testing/postgres.ts`) before migrating, the way the bootstrap does in a real environment; a missing role is created `NOLOGIN`. The notes publication migration fails if either is missing, and `parity.test.ts` proves it.

`packages/api/src/platform/sync/parity.ts` introspects the migrated Postgres (columns, types, nullability, defaults, indexes, publication membership) and compares it with a declared expectation; add each synced table to the expectation in `parity.test.ts`. It also parses `powersync/sync-config.yaml` and checks each stream's explicit columns against the table, the publication, the `user_id = auth.user_id()` and `deleted_at IS NULL` filters and the upload handler registry.

Pure-function unit tests: client-IP resolver, disposable-domain matcher, Turnstile verifier (stub `fetch`), preferences `ui` defaults, return-location sanitiser, boundaries lint rule, template-init.

## e2e (Playwright)

The real web app behind the dev proxy, the real API server and a real Postgres (`E2E_DATABASE_URL`, default `postgresql://postgres:password@localhost:5432/<name>_e2e`; the suite recreates it). Emails go to the log transport; helpers in `e2e/support` (`users.ts`, `emails.ts`, `fixtures.ts`) register verified users and read links from the server log. Ports come from `app.config.ts`, so stop `pnpm dev` first. One worker, no retries locally, one retry in CI.

- Each test registers its own users with unique emails.
- Select by role and label, as a user would. No fixed sleeps; wait on visible state.
- Run one test: `pnpm --filter web exec playwright test -g "name"`. Traces and the server log land in `apps/web/e2e/.artifacts`.

Native has no automated UI test seam in v1. Shared pure helpers and session-cache behavior are tested in `packages/client`.

Before a native release, smoke-test on a device:

- Open `/notes` and `/settings/preferences` deep links while signed out; password and provider login must restore the destination.
- Sign out, then separately revoke a session and trigger an RPC: both must show sign-in immediately.
- Sign in with a provider, sign out and restart: the provider must retain its last-used marker.
- On an English device, choose German, then Device language: English must apply immediately and after restart.
- Request deletion from native only, with no browser cookies; the email must open the in-app confirmation, and confirming must revoke every session and remove account data.
- Open a reset link with an existing session: resetting must return to sign-in with no stale user data.
