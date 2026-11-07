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
- **Seam 1 / Seam 2** — the two test seams: the API router called in-process against PGlite, and the browser (Playwright) against the real stack.
- **Path routes** — the Cloudflare routes that send `/api/*` and `/rpc/*` to the Dokploy origin and everything else to the Worker.
- **Origin** — the Dokploy server (Traefik, then the server container). Firewalled to Cloudflare's IP ranges.
- **Brand tokens** — `packages/ui/src/tokens/brand.ts`, the one place colors, radius and fonts are defined; mapped to web and native by generated CSS.
