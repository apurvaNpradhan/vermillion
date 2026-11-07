# 0017. Sync credentials: Better Auth JWT and a sync subdomain

Status: accepted (2026-11-07). Covers D8, D9.

## Context

PowerSync authenticates with a bearer JWT, not cookies. Its stream is a long-lived connection. [0005](0005-same-origin-cloudflare-path-routes.md) routes `/api/*` and `/rpc/*` on one origin.

## Decision

- Production PowerSync runs on a `sync.` subdomain through Traefik on Dokploy, Cloudflare proxied. The client gets the endpoint from `sync.credentials`, never from a build-time constant. [0005](0005-same-origin-cloudflare-path-routes.md)'s same-origin rule does not apply to this transport.
- The Better Auth `jwt()` plugin issues EdDSA (Ed25519) tokens with `kid` and `alg` in header and JWKS, `aud: powersync` and a short expiry. PowerSync reads `/api/auth/jwks`. The installed plugin's generated schema and migration are used, not a hand-copied table.
- Two oRPC procedures on the `authed` seam: `sync.credentials` returns `{ endpoint, token, userId, expiresAt }`; `sync.upload` applies one client transaction ([0018](0018-upload-protocol.md)). Upload handlers call vertical operations, never raw SQL.
- Credential isolation: before connecting or refreshing, compare the returned `userId` with the database's Device owner and the current session generation. Never connect another user's stream to an existing owner's database. Reject stale async completions after sign-out or account switch. `expiresAt` reflects the JWT expiry. Never trust a client-supplied `user_id`.
- A JWT is not a live session. Deleting a session does not revoke an issued token; revocation exposure is bounded by token expiry. Account and admin actions always require network auth regardless of local state.

## Consequences

- Settled in phase 4: the token lives **5 minutes** (`SYNC_JWT_TTL_SECONDS`), so a deleted session, ban or account deletion cuts stream access within at most 5 minutes plus the service's own token cache. `sync.credentials` mints a fresh token on every call; the connector renews when less than about a minute remains (the renewal margin is a connector setting, phase 5). `sub` is the user id, `aud` is `powersync` (matches `client_auth.audience`), `iss` the app origin; the payload carries nothing else. `disableSettingJwtHeader` keeps tokens out of ordinary responses. The `jwt()` plugin signs EdDSA/Ed25519, rotates keys every 30 days and keeps retired keys in the JWKS for its 30-day grace period, far longer than a token lives, so rotation needs no overlap handling. The JWKS is Better Auth's default `/api/auth/jwks`, which `powersync/service.yaml` (`PS_JWKS_URI`) already reads. The `jwks` table comes from the installed plugin's schema (checked against `getAuthTables`; the separate CLI could not be run here).
- The endpoint returned by `sync.credentials` is `SYNC_ENDPOINT_URL` (development default `127.0.0.1:8090`); unset in production, credentials answer `BAD_GATEWAY`.
- Open item, phase 2 and 8: CORS, CSP `connect-src`, proxy buffering, idle timeout and reconnect behavior on the subdomain, verified before rollout.
- Existing origin, cookie and IP defenses are not weakened for PowerSync.
