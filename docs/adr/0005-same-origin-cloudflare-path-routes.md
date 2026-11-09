# 0005. One origin: Cloudflare path routes to the Dokploy origin

Status: superseded by [0033](0033-mobile-first-api-host.md) (2026-11-09). Originally accepted 2026-11-06.

## Context

The web app runs on a Cloudflare Worker, the API on Dokploy behind Traefik. Cross-origin setups need CORS, `SameSite=None` or a cookie domain, and make CSRF protection harder.

## Decision

One hostname per app. The Worker serves the web app; Cloudflare routes `/api/*` and `/rpc/*` to the Dokploy origin. Cookies are host-only with `SameSite=Lax`, with no CORS configuration. In development the Vite dev server proxies the same two paths to the API server so behaviour matches. Native apps call the same origin. A trusted-origin middleware rejects state-changing browser requests whose `Origin` is not the app's origin; requests with no `Origin` (native, server to server) must bring their own credentials.

The server resolves the client IP from `X-Forwarded-For` only through trusted-proxy CIDRs (Traefik and Cloudflare), and the origin is firewalled to Cloudflare's ranges so Cloudflare cannot be bypassed. See [deployment.md](../deployment.md).

## Consequences

- The two Worker-less routes (`/api/*`, `/rpc/*`) are configured in the Cloudflare dashboard because wrangler cannot express them.
- `TRUSTED_PROXIES` must be kept in step with Cloudflare's published ranges.
