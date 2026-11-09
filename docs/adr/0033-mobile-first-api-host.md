# 0033. Mobile first: no web app, the API on its own host

Status: accepted (2026-11-09). Supersedes [0005](0005-same-origin-cloudflare-path-routes.md), [0012](0012-web-rendering-model.md), [0014](0014-template-init-script.md) and [0020](0020-offline-web-shell.md); amends [0001](0001-template-base.md), [0013](0013-shared-brand-tokens.md) and [0032](0032-passkeys-with-a-dev-tunnel-rp-id.md).

## Context

Vermillion started as a product-neutral template with a web app, a native app and an API on one origin. The web app mirrored the whole product. What is wanted now is the mobile app alone. Web comes back later as two separate things: a marketing site, and a companion app once the mobile features have settled. A mirror of the product is neither of them, and keeping it costs a deploy target, an e2e suite and a second UI kit while the product is still moving.

## Decision

- `apps/web` is deleted. The last commit that has it is tagged `pre-web-removal`. The marketing site and the companion app are separate future apps that consume the same API and sync data; nothing is designed around them except keeping `packages/api` and the server client-agnostic.
- Vermillion is one product's mobile-first monorepo, not a template. `app.config.ts` stays the single source for the app's identity; `template-init` and the "product-neutral" framing are gone.
- The API lives on its own host, `api.<domain>`, on Dokploy behind Cloudflare. There are no path routes and no Worker. `APP_URL` is that origin, and the passkey RP id defaults to its hostname. The marketing site can own the apex later without touching auth.
- The server serves `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` (404 until `ANDROID_CERT_SHA256` and `APPLE_TEAM_ID` are set).
- The admin surface is removed with its only client: the admin oRPC vertical, `ADMIN_EMAILS`, role reconciliation and the Better Auth admin plugin. Schema columns stay (migrations are additive-only, [0007](0007-additive-migrations.md)). A closed registration (`REGISTRATION_OPEN=false`) now refuses every unknown address.
- Web-only code in shared packages is deleted: the coss components and web CSS in `packages/ui` (it is now tokens only), the cross-tab lock and channel in the sync lifecycle controller, the web env entry. The Playwright e2e suite is deleted; native confidence comes from seam 1, seam 3 and unit tests.
- The web-era ADRs stay as history with their status changed.

## Consequences

- Nothing was live, so there is no DNS cutover or data migration. The first production host is `api.<domain>`.
- Operations (user lookup, bans, deletion) go through database access and logs until a companion app brings an admin surface back.
- The cookie and trusted-origin rules from [0005](0005-same-origin-cloudflare-path-routes.md) still hold for the API itself: host-only cookies, `SameSite=Lax`, and state-changing browser requests from other origins rejected. `TRUSTED_PROXIES` and the Cloudflare-only firewall are unchanged.
- The dev tunnel now points at the server (`:3000`) alone. Anyone with a tunnel config from before this change must repoint its ingress.
- Revisiting web means starting from the tag for reference, not reviving it: the companion's platform, UI kit and offline needs are open decisions.
