# Testing

| What                                 | Where                                 | Run                                                         |
| ------------------------------------ | ------------------------------------- | ----------------------------------------------------------- |
| API behaviour (seam 1)               | `packages/api/src/**/*.test.ts`       | `pnpm test`                                                 |
| Pure functions with many edge cases  | next to the code (`*.test.ts`)        | `pnpm test`                                                 |
| Sync infrastructure on real Postgres | `packages/api/src/**/*.infra.test.ts` | `pnpm test:sync-infra` (skips without the compose Postgres) |
| Repo tooling                         | `scripts/**/*.test.mjs`, `tools/**`   | `pnpm test` (root project)                                  |
| Browser flows (seam 2)               | `apps/web/e2e/*.spec.ts`              | `pnpm test:e2e`                                             |

Good tests exercise external behaviour through the highest seam and survive refactoring: splitting files or swapping a library behind a seam must not break them. Do not mock our own modules. Do not assert on internals.

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
