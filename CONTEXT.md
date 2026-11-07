# Vermillion context

Vermillion is a product-neutral template for apps with personal accounts: a web app (TanStack Start on a Cloudflare Worker), a native app (Expo) and an API server (Hono and oRPC on Dokploy), all served from one origin. Decisions are recorded in `docs/adr/`.

## Glossary

- **App config** — `app.config.ts`, the single source of the app's name, URLs, ports, bundle ids, scheme and versions. `pnpm template:init` rewrites the values that cannot import it.
- **Template / fork** — the template is this repository; a fork is an app created from it. A fork pulls template fixes through an `upstream` remote.
- **Vertical** — a self-contained slice of domain code (`account`, `preferences`, `admin`, `auth`, `notes`) with procedures, operations, tables and a public `index.ts`. Other verticals may import it only through that index. Web and native modules mirror the shape. Deleting a feature is deleting its vertical.
- **Platform** — shared infrastructure inside an app or `packages/api`: database startup, HTTP middleware, the oRPC base, rate limiting, jobs, health. Importable from every vertical; not a vertical.
- **Operation** — one file in a vertical doing one thing (create a note, delete an account). Procedures call operations.
- **Procedure** — an oRPC endpoint built from the `public`, `authed` or `admin` builder.
- **`authed` seam** — the single builder that resolves the signed-in user. The collaboration fork extends it to require workspace membership.
- **Module hook** — the only way a component reads or writes app data (`use-notes`, `use-preferences`). A local-first fork swaps what the hooks call, not the components.
- **Example vertical** — `notes`: a complete create, read, update, delete reference with ownership checks. Marked for deletion in every fork.
- **User preferences** — one row per user, created on first write: `locale`, `timezone` and a `ui` jsonb with defaults. A missing row means defaults. Theme is not a preference: it is stored per device.
- **Locale resolution** — saved preference, then locale cookie, then `Accept-Language` (device locale on native), then `en`.
- **Admin** — a user whose verified email is in `ADMIN_EMAILS`. The env var is the only source; roles are reconciled at boot and on session creation.
- **Registration policy** — `REGISTRATION_OPEN`. When false only admin emails can register.
- **Disposable email** — an address on a domain from the maintained `disposable-email-domains` list (parent domains included). Rejected at sign-up and email change.
- **Turnstile** — Cloudflare's CAPTCHA. Active when the secret is set, on sign-up, sign-in and password reset, with no client exempt.
- **Trusted proxies** — the CIDRs (`TRUSTED_PROXIES`: Traefik and Cloudflare) from which the server accepts `X-Forwarded-For` when resolving the client IP.
- **Trusted origin** — the app's own origin; state-changing browser requests from any other `Origin` are rejected.
- **Job** — a Postgres-backed (pg-boss) unit of background work run inside the server process. Defined by queue name, zod payload (ids only), handler and retry settings.
- **Device owner** — the local identity (user id) a device's synced database belongs to. Not server authorization. Credentials and uploads for any other user are refused. Lives in `tests/sync`; round-trip tests land in later sync phases ([0021](docs/adr/0021-device-owner-and-account-lifecycle.md)).
- **Rejected write** — an upload the server permanently refused. Kept in the local-only `rejected_writes` table with its payload so the user can review, retry or discard it. Lives in `tests/sync`; round-trip tests land in later sync phases ([0018](docs/adr/0018-upload-protocol.md)).
- **Sync stream** — a PowerSync Sync Streams definition that selects which Postgres rows replicate to a user's device, filtered by `user_id`. Lives in `tests/sync`; round-trip tests land in later sync phases ([0015](docs/adr/0015-powersync-self-hosted.md)).
- **Bootstrap (sync)** — the idempotent admin job that creates the replication role, storage database and empty publication before PowerSync starts. Lives in `tests/sync`; round-trip tests land in later sync phases ([0023](docs/adr/0023-replication-setup.md)).
- **Seam 3** — the sync test seam: headless `@powersync/node` clients against `powersync-service`, the server and Postgres, run by `pnpm test:sync`. Lives in `tests/sync`; round-trip tests land in later sync phases ([0024](docs/adr/0024-test-strategy.md)).
- **Replay identity** — the durable identity (account, install, transaction, request digest) an upload carries so the server returns the same outcome after a lost response instead of re-applying it ([0018](docs/adr/0018-upload-protocol.md)).
- **Seam 1 / Seam 2** — the two test seams: the API router called in-process against a clone of a migrated template database on the Docker Postgres, and the browser (Playwright) against the real stack.
- **Path routes** — the Cloudflare routes that send `/api/*` and `/rpc/*` to the Dokploy origin and everything else to the Worker.
- **Origin** — the Dokploy server (Traefik, then the server container). Firewalled to Cloudflare's IP ranges.
- **Brand tokens** — `packages/ui/src/tokens/brand.ts`, the one place colors, radius and fonts are defined; mapped to web and native by generated CSS.
