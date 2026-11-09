# Vermillion context

Vermillion is a mobile-first monorepo for an app with personal accounts: a native app (Expo) and an API server (Hono and oRPC on Dokploy, at `api.<domain>`). There is no web app; a marketing site and a companion app come later as separate apps ([0033](docs/adr/0033-mobile-first-api-host.md)). Decisions are recorded in `docs/adr/`.

## Glossary

- **App config** — `app.config.ts`, the single source of the app's name, URLs, ports, bundle ids, scheme and versions. Files that cannot import it (compose names, the server Dockerfile port, EAS URLs) are edited by hand.
- **Vertical** — a self-contained slice of domain code (`account`, `preferences`, `auth`, `exercise`) with procedures, operations, tables and a public `index.ts`. Other verticals may import it only through that index. The native modules mirror the shape. Deleting a feature is deleting its vertical.
- **Platform** — shared infrastructure inside an app or `packages/api`: database startup, HTTP middleware, the oRPC base, rate limiting, jobs, health. Importable from every vertical; not a vertical.
- **Operation** — one file in a vertical doing one thing (create a Custom exercise, delete an account). Procedures call operations.
- **Procedure** — an oRPC endpoint built from the `public` or `authed` builder.
- **`authed` seam** — the single builder that resolves the signed-in user.
- **Module hook** — the only way a component reads or writes app data (`use-exercise-library`, `use-preferences`). The sync layer sits behind the hooks, not in the components.
- **Reference vertical** — `exercise` is the first real vertical and the worked example of a synced table: a Reference-data catalog plus per-user Custom exercises, retire-never-delete, an upload handler, a client schema and seam 1 and 3 tests ([ADR 0034](docs/adr/0034-exercise-library.md)). The earlier `notes` example was removed ([ADR 0035](docs/adr/0035-remove-notes-example.md)); its tables stay in Postgres unused.
- **User preferences** — one row per user, created on first write: `locale`, `timezone` and a `ui` jsonb with defaults. A missing row means defaults. Theme is not a preference: it is stored per device ([native themes](docs/guides/native-themes.md)).
- **Locale resolution** — saved preference, then locale cookie, then `Accept-Language` (device locale on native), then `en`.
- **Registration policy** — `REGISTRATION_OPEN`. When false no new account can register; existing accounts still sign in.
- **Disposable email** — an address on a domain from the maintained `disposable-email-domains` list (parent domains included). Rejected when a sign-in code is requested and at email change.
- **Turnstile** — Cloudflare's CAPTCHA. Active when the secret is set, before a sign-in code is sent and on social sign-in, with no client exempt.
- **Sign-in code** — the 6-digit one-time code emailed to an address; the only non-social way in. Valid 5 minutes, hashed at rest, 3 guesses, a resend replaces it. Redeeming it creates the account on first use.
- **Onboarding step** — a required question (today: the name) whose completeness is derived from the profile by `pendingOnboardingSteps`; there is no stored flag. Account first: the person is signed in before being asked.
- **Trusted proxies** — the CIDRs (`TRUSTED_PROXIES`: Traefik and Cloudflare) from which the server accepts `X-Forwarded-For` when resolving the client IP.
- **Trusted origin** — the API's own origin (`APP_URL`) plus the passkey origins; state-changing browser requests from any other `Origin` are rejected. Native requests carry no `Origin` and bring their own credentials.
- **Job** — a Postgres-backed (pg-boss) unit of background work run inside the server process. Defined by queue name, zod payload (ids only), handler and retry settings.
- **Device owner** — the local identity (user id) a device's synced database belongs to. Not server authorization. Credentials and uploads for any other user are refused. Lives in `tests/sync`; round-trip tests land in later sync phases ([0021](docs/adr/0021-device-owner-and-account-lifecycle.md)).
- **Rejected write** — an upload the server permanently refused. Kept in the local-only `rejected_writes` table with its payload so the user can review, retry or discard it. Lives in `tests/sync`; round-trip tests land in later sync phases ([0018](docs/adr/0018-upload-protocol.md)).
- **Sync stream** — a PowerSync Sync Streams definition that selects which Postgres rows replicate to a user's device, filtered by `user_id`. Lives in `tests/sync`; round-trip tests land in later sync phases ([0015](docs/adr/0015-powersync-self-hosted.md)).
- **Bootstrap (sync)** — the idempotent admin job that creates the replication role, storage database and empty publication before PowerSync starts. Lives in `tests/sync`; round-trip tests land in later sync phases ([0023](docs/adr/0023-replication-setup.md)).
- **Seam 3** — the sync test seam: headless `@powersync/node` clients against `powersync-service`, the server and Postgres, run by `pnpm test:sync`. Lives in `tests/sync`; round-trip tests land in later sync phases ([0024](docs/adr/0024-test-strategy.md)).
- **Reference data** — rows identical for every user and written only by the server (today: the exercise catalog, `exercise.user_id IS NULL`). Read-only on devices; retired, never deleted ([0034](docs/adr/0034-exercise-library.md)).
- **Exercise catalog** — the Reference data exercises, imported from a committed file at migrate time and synced by a global stream.
- **Custom exercise** — an `exercise` row owned by a user. Archived and restored, never deleted; its type is fixed once a set uses it.
- **Muscle group** — one of 20 code-defined slugs an exercise targets (one primary, any secondary). The body map draws 17 of them.
- **Replay identity** — the durable identity (account, install, transaction, request digest) an upload carries so the server returns the same outcome after a lost response instead of re-applying it ([0018](docs/adr/0018-upload-protocol.md)).
- **Seam 1** — the API router called in-process against a clone of a migrated template database on the Docker Postgres. There is no browser seam since the web app was removed.
- **Origin** — the Dokploy server (Traefik, then the server container) behind the proxied `api.<domain>` record. Firewalled to Cloudflare's IP ranges.
- **Brand tokens** — `packages/ui/src/tokens/brand.ts`, the one place colors, radius and fonts are defined; mapped to native by generated CSS and read directly by the email templates.
- **Theme** — the native app's colour scheme: System, Light or Dark, colour-only, never layout. Light and Dark are Classic, as in email ([0031](docs/adr/0031-native-themes-colour-only-oklch.md), amended: named themes sunset).
- **Theme setting** — Settings → Preferences → Theme, a select that sets `device.theme` (`"system" | "light" | "dark"`). System follows the OS; Light and Dark force the colour scheme for native chrome.
- **Identity / on-identity** — the accent roles: `identity` (focus, checks, selection, active tab, compose fill) and `on-identity` for the icon or text on it. The primary action stays neutral.
