# 0032. Passkeys via Better Auth with a dev tunnel for the RP ID

Status: accepted (2026-11-08).

## Context

Email codes ([0029](0029-email-otp-auth-and-account-first-onboarding.md)) are the only way in besides social providers. A passkey is faster on a phone and cannot be phished. WebAuthn binds a credential to an RP ID (a registrable domain) and to the origin that asked for it. A browser accepts `localhost`; Android and iOS only let an app use a domain's passkeys after the domain publishes an association file naming the app, so a phone cannot test passkeys against `localhost` or a bare LAN address.

## Decision

- **Plugin.** `@better-auth/passkey` pinned to the same version as `better-auth` (1.7.18; its peer range is `^1.7.18`), through the workspace catalog. It adds a `passkey` table (additive migration). Passkeys sign in an existing account and are added from a signed-in, fresh session (the plugin default `requireSession`); they never create accounts, so registration policy, disposable-domain checks and the email-first onboarding are unchanged. A passkey sign-in sends the usual `sign-in-notice`.
- **Relying party from configuration.** `rpName` is the app's display name. `rpID` is `AUTH_RP_ID`, defaulting to the hostname of the web URL in development and of `productionUrl` in production. `AUTH_PASSKEY_ORIGINS` (default: the web origin) is the explicit list the plugin verifies against; a request cannot add to it. `ANDROID_CERT_SHA256` adds the matching `android:apk-key-hash:<base64url sha256>` origin of each signing certificate, so there is one value to maintain per key. Browser origins in the list are also trusted origins (Better Auth and the API's origin middleware); Android origins are not HTTP origins and are checked only by the passkey plugin.
- **Association files from the web Worker.** `/.well-known/assetlinks.json` (relations `get_login_creds` and `handle_all_urls`, the Android package from `app.config.ts`, the fingerprints) and `/.well-known/apple-app-site-association` (`webcredentials.apps`, `TEAMID.bundleId`) are TanStack Start server routes in `apps/web`, built from public `VITE_ANDROID_CERT_SHA256` and `VITE_APPLE_TEAM_ID`, 404 while unset. Production's Worker route owns every path except `/api/*` and `/rpc/*` ([0005](0005-same-origin-cloudflare-path-routes.md)), so no dashboard route changes; in development the same routes answer through Vite, and the tunnel reaches them. Serving them from the API would have needed a third Worker-less route and a Vite proxy entry.
- **Dev tunnel.** A named Cloudflare tunnel maps a hostname the developer owns to the Vite dev server (`pnpm dev:tunnel`, config path from `VERMILLION_TUNNEL_CONFIG`). Vite accepts the host through `DEV_PUBLIC_HOSTS` (`server.allowedHosts`), and the same hostname goes into `AUTH_RP_ID` and `AUTH_PASSKEY_ORIGINS`. The template commits no hostname; setup is in [native-dev.md](../guides/native-dev.md).
- **Rate limits** on the passkey authenticate and register endpoints, in the same table as the code endpoints.

## Consequences

- The RP ID is permanent: changing it orphans every passkey. Passkeys made against the dev tunnel hostname stay in the development database only.
- The fingerprint lives in two env files (server for the origin, web for the association file) because the Worker takes no server secrets; both are public values.
- Production needs the EAS/Play signing fingerprints in `ANDROID_CERT_SHA256` and `VITE_ANDROID_CERT_SHA256` before passkeys work in a store build; the debug keystore fingerprint is for development only.
- Android reports the origin of the calling app, not of the page, so a rebuilt app signed with a different key fails verification until its fingerprint is added.
- Amended 2026-11-09 ([0033](0033-mobile-first-api-host.md)): the association files are served by the API server (Hono) from `ANDROID_CERT_SHA256` and `APPLE_TEAM_ID`, not by a web Worker, and the dev tunnel maps to the server on port 3000. The RP id defaults to the hostname of `APP_URL` (`api.<domain>` in production).
