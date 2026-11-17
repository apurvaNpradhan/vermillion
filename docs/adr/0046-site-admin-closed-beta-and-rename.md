# 0046. The site, the admin, the closed beta and the rename to Cinnabar

Status: accepted (2026-11-17). Amends [0033](0033-mobile-first-api-host.md) (a web app returns) and
[0034](0034-exercise-library.md) (the catalog's source of truth). Withdraws
[0032](0032-passkeys-with-a-dev-tunnel-rp-id.md) until the final domain. Spec:
[docs/specs/web/01-site-admin-and-rename.md](../specs/web/01-site-admin-and-rename.md).

## Context

The owner could not run the app: catalog fixes needed a deploy, account support needed the
database, and there was no public page, privacy policy, deletion URL or stable download link.
Registration was all or nothing. The name "vermillion" was ambiguous and the bundle id was the
scaffold default. The owner has only `lostsignal.cloud` for about two months, on Cloudflare's free
plan (one level of subdomain), and passkeys and verified app links break when the domain changes.

## Decision

- **Rename.** The app is Cinnabar: scheme `cinnabar`, bundle id
  `io.github.apurvanpradhan.cinnabar` on both platforms (independent of any domain). The repository
  folder, the `@workspace/*` scope, the development stack's compose project, containers, volumes and
  database names, and earlier ADRs keep the old name.
- **One domain value.** `app.config.ts` holds `domain` and derives the site
  (`cinnabar.<domain>`), the API (`cinnabar-api.<domain>`), sync (`cinnabar-sync.<domain>`) and
  exercise media (`media.<domain>`). Names that cannot import it are edited by hand.
- **The site returns** as `apps/web`, TanStack Start on a Cloudflare Worker with static assets.
  Public pages are prerendered; `/admin` and `/invite` render on the client from one shell. The
  browser talks only to the site's origin: the Worker forwards `/rpc` and `/api` to the API host
  with a fresh `X-Forwarded-For` taken from `CF-Connecting-IP`, and resolves `/download` to the
  newest APK. The native app keeps calling the API host directly.
- **Admin.** The `role` column is reconciled with `ADMIN_EMAILS` on start and every sign-in; it is
  the only way to become an admin. Admin procedures use one builder: session, role re-read from
  the database, allowlist (both NOT_FOUND), authenticator enrolled and passed on this session
  (FORBIDDEN `TWO_FACTOR_REQUIRED`). Every admin write commits with one `admin_audit` row.
- **TOTP for admins only.** Better Auth's two-factor plugin (authenticator plus backup codes). The
  plugin gates only password sign-in, which we do not have, so instead each session carries
  `two_factor_verified_at`, set when the authenticator (or a backup code) is passed; the admin
  builder requires it. Only allow-listed admins reach the plugin's endpoints, and disable and
  backup-code regeneration are closed, so a stolen inbox cannot remove or replace the second step.
  The owner's native sign-in is unaffected.
- **Catalog source of truth: the database.** The committed file is a seed applied only to an empty
  table; the admin edits rows (never deletes them), and an export reproduces the file.
- **Closed beta.** An account may be created only by an address with a live invite (or an address
  in `ADMIN_EMAILS`), checked in the user-creation hook so email codes and Google behave alike.
  `REGISTRATION_OPEN=true` keeps open sign-up for development.
- **Passkeys and app links withdrawn** until the final domain; the `passkey` table stays.
- **Releases.** A `minimum_app_version` setting and `release.status` (GitHub Releases, cached ten
  minutes, stale on failure). The app checks hourly and blocks only below a known minimum.

## Consequences

- One more deploy target (the Worker) with its own workflow, gated on CI like the server.
- Moving to the final domain is configuration (see docs/deployment.md) plus a new app build; no
  data migration. Passkeys and verified app links return then, as their own decision.
- The site has no browser e2e suite (0026); its Worker routing and admin gate are unit tested.
