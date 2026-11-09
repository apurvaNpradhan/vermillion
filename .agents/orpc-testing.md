# oRPC testing (seam 1)

Test procedures and Better Auth through the router in-process against the Docker Postgres (`pnpm db:start`), on a database cloned from a template with every migration applied. No HTTP. Without Postgres the suite fails and says to run `pnpm db:start`.

```ts
import { createTestApp } from "../platform/testing/harness";

const app = await createTestApp();
const headers = await createSignedInUser(app, "a@example.com"); // request headers carrying the session
const client = app.client(headers); // app.client() with no headers is anonymous
const note = await client.notes.create({ title: "x", body: "" });
```

`platform/testing/harness.ts` exports `createTestApp(options)` (`app`, `services`, a router `client(headers)` factory, an `outbox` of rendered emails, `rows(sql)` for asserting on stored data and `waitForEmail`), plus `createSignedInUser`, `signIn` (request a code, read it from the outbox, redeem it), `requestSignInCode`, `codeIn` (the code in a code email), `linkIn` (first link in an email) and `cookieFrom`. Options override config (`registrationOpen`, `adminEmails`, `turnstileSecret`, ...), replace `fetch` and make email sends fail.

## Rules

- Call the highest seam: the router client or Better Auth's server API. Do not import an operation to test it.
- Do not mock our modules, oRPC, Better Auth, Hono or middleware. Replace only the network boundary: the CAPTCHA `fetch` and the email transport (the harness does both).
- Assert through the public contract: returned data, error `code` and `status`, rows visible through another procedure, emails in the outbox. Not call counts or internals.
- For a protected procedure cover the pair: anonymous gets `UNAUTHORIZED`, a signed-in user reaches the handler. For owned data add: another user gets `NOT_FOUND`.
- Jobs run in-process with zero retry delay and half-second polling; use `waitForEmail` or poll `rows` with a deadline rather than sleeping a fixed time.
- Rate-limit tests use a small `max` through the config and assert `TOO_MANY_REQUESTS`.

## Databases

`packages/api/vitest.config.ts` runs `platform/testing/global-setup.ts` once per run. It creates `vermillion_test_tpl_<run>` and migrates it with the production migrator (advisory lock included). `createTestApp()` then runs `CREATE DATABASE ... TEMPLATE` for its own clone, points the Drizzle pool and pg-boss at it, and `close()` drops the clone (`WITH (FORCE)`, replication slots dropped first). The template is dropped when the run ends. Names carry a run id and the process id, so parallel files and parallel runs on one Postgres do not collide. Nothing may connect to the template after setup; Postgres refuses to copy a template in use.

Each test creates its own app (a fresh clone), so tests do not share state, except files that deliberately build one app in `beforeAll` (for example `notes.test.ts`). For direct SQL or schema work without an app, use `cloneDatabase` / `dropDatabase` from `platform/testing/postgres.ts` (see `platform/sync/parity.test.ts`). Always drop what you create; do not leave roles or slots behind.
