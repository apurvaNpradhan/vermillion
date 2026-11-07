# Deployment

One hostname per app. Cloudflare serves the web app from a Worker and sends `/api/*` and `/rpc/*` to the API server on Dokploy. Browser, cookies and API share one origin, so there is no CORS and no cookie domain to configure.

```text
browser ──► Cloudflare ──┬─ /api/*, /rpc/*  ──► Dokploy: Traefik ──► server container ──► Postgres service
                         └─ everything else ──► Worker (TanStack Start, SSR)
```

Native apps call the same origin (`EXPO_PUBLIC_SERVER_URL`), so they reach the server through the same Cloudflare routes.

Before the first deploy run `pnpm template:init` ([README](../README.md#starting-a-new-app)) so the wrangler name and route, EAS profiles and compose names match `app.config.ts`.

## API server on Dokploy

Three Dokploy pieces in one project: a PostgreSQL database service, the server application, and (optional) a backup destination. Nothing publishes a host port except Traefik.

### Postgres

1. Create a PostgreSQL 18 database service in the project. Leave its external port unset: it is reachable only on `dokploy-network`.
2. Set up backups first: [runbook](runbook.md#postgres-and-backups).

### Server application

1. Create an **Application** from this GitHub repository, branch `main`.
2. Build type **Dockerfile**: Dockerfile path `apps/server/Dockerfile`, docker context path `.` (the repo root). The image bundles every dependency, so it carries no `node_modules`; Nixpacks was not chosen because it would have to guess a monorepo build (see [ADR 0009](adr/0009-dokploy-dockerfile.md)).
3. Autodeploy **on**. Dokploy builds the same commit that the web deploy job ships. CI gates the Worker, not the server: if you need the server gated as well, turn Autodeploy off and call Dokploy's deploy webhook from a workflow step.
4. Environment: see [Environment](#environment).
5. Domain: the app's hostname, port `3000`, HTTPS (Let's Encrypt), path `/api` and a second entry for path `/rpc`. Cloudflare SSL/TLS mode must be **Full (strict)**.
6. Health check: the image declares one against `/api/health`. Dokploy shows the container unhealthy if it fails.

The container waits for Postgres, applies migrations (connection passwords are stripped from the startup log), starts the pg-boss workers and only then listens. On `SIGTERM` it stops accepting requests and drains pending email jobs for up to 10 seconds. Run one replica: rate-limit counters live in process memory and jobs run in the server process.

Migrations are additive-only: a release adds columns and tables, a later release removes what is no longer used. The old container keeps working while a deploy replaces it, and a rollback is possible. See [ADR 0007](adr/0007-additive-migrations.md).

### Environment

Validated at startup by `packages/env`; the server exits with the failing variable named. `apps/server/.env.example` lists them all.

| Variable                                                   | Required          | Notes                                                                                                                |
| ---------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                             | yes               | The Postgres service's internal connection string.                                                                   |
| `APP_URL`                                                  | yes               | Public origin, `https://app.example.com`. Auth links and the trusted-origin check use it.                            |
| `BETTER_AUTH_SECRET`                                       | yes               | 32+ chars, `openssl rand -hex 32`. Placeholders are refused in production.                                           |
| `TRUSTED_PROXIES`                                          | yes in production | Comma-separated CIDRs allowed to set `X-Forwarded-For`; see below.                                                   |
| `ADMIN_EMAILS`                                             | no                | Verified emails that hold the admin role. Also bypass a closed registration.                                         |
| `REGISTRATION_OPEN`                                        | no                | `false` closes sign-ups. Default `true`.                                                                             |
| `TURNSTILE_SECRET_KEY`                                     | no                | Enables the CAPTCHA on sign-up, sign-in and password reset. Pair with the site key on web and native.                |
| `GOOGLE_CLIENT_ID`/`_SECRET`, `GITHUB_CLIENT_ID`/`_SECRET` | no                | A provider is enabled only when both of its values are set.                                                          |
| `RESEND_API_KEY`, `EMAIL_FROM`                             | production        | Without a key emails are printed to the log. `EMAIL_CONSOLE=true` forces that in production (throwaway stacks only). |

Sync infrastructure (PowerSync, phase 2; the sync features themselves are not live yet):

| Variable                                                       | Required   | Notes                                                                                                                                   |
| -------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `POWERSYNC_REPLICATION_PASSWORD`, `POWERSYNC_STORAGE_PASSWORD` | for sync   | Bootstrap job and PowerSync service. 16+ URL-safe characters (`openssl rand -hex 24`). Placeholders are refused in production.          |
| `SYNC_ADMIN_DATABASE_URL`                                      | production | Bootstrap job only: a role with CREATEROLE, CREATEDB and REPLICATION (or superuser). Not the runtime role. Never give it to the server. |
| `SYNC_SLOT_LAG_WARN_MB`, `SYNC_SLOT_LAG_CRITICAL_MB`           | no         | Slot lag thresholds. Defaults 1024 and 3072. Critical marks `/api/ready` degraded.                                                      |

The Worker takes **no** secrets: the web bundle gets public `VITE_*` values at build time only (`VITE_SERVER_URL`, `VITE_TURNSTILE_SITE_KEY`).

### Sync infrastructure (minimal; the full guide is phase 8)

1. **Postgres flags.** Set on the Postgres service (Dokploy: Advanced, command arguments): `-c wal_level=logical -c max_wal_senders=10 -c max_replication_slots=10 -c max_slot_wal_keep_size=<budget>`. Changing `wal_level` needs a restart. The development value (4GB) is not a production sizing; size it from write rate and outage plus resnapshot time ([ADR 0025](adr/0025-sync-observability.md)).
2. **Bootstrap job.** After the server image is built and Postgres has the flags, run once per deploy (idempotent) as a one-shot from the same image: `node sync-bootstrap.mjs`, with `DATABASE_URL`, `SYNC_ADMIN_DATABASE_URL` and the two `POWERSYNC_*_PASSWORD` values. It exits non-zero on any preflight failure.
3. **PowerSync service.** A Dokploy Compose application on the same network: image `journeyapps/powersync-service:1.28.1@sha256:4955ebd8218d076f23296750f658c2973ce1dcd2ba49a6c7a7c3320acf97325c`, command `start -r unified`, `powersync/service.yaml` and `powersync/sync-config.yaml` mounted at `/config`, environment as in `docker-compose.yml` (`PS_PORT`, `PS_SSLMODE`, `PS_DATA_SOURCE_URI`, `PS_STORAGE_SOURCE_URI`, `PS_JWKS_URI`, `PS_ADMIN_TOKEN`) with production values (`PS_SSLMODE=verify-full`, or `verify-ca` with a `cacert` added to the connection in `powersync/service.yaml`; PowerSync 1.28.1 has no `require`. `PS_JWKS_URI` the API's internal `/api/auth/jwks`). No host port: the `sync.` subdomain through Traefik arrives with the credentials work ([ADR 0017](adr/0017-sync-credentials-and-transport.md)).
   PowerSync service variables: `PS_PORT` (8080 in the container), `PS_SSLMODE` (`disable` in development, otherwise `verify-full` or `verify-ca`), `PS_DATA_SOURCE_URI` (`postgresql://powersync_replication:<password>@<host>:5432/<app db>`), `PS_STORAGE_SOURCE_URI` (same host, user `powersync_storage`, database `powersync_storage`), `PS_JWKS_URI`, `PS_ADMIN_TOKEN` (a generated secret). <!-- secret-scan:allow -->
4. **Probes.** PowerSync's `/probes/readiness` is its Dokploy health check. The server keeps `/api/health` (liveness). Point an external monitor at `/api/ready`: it returns 503 when a replication slot is invalidated or its lag reaches the critical threshold. A restart does not fix either, which is why Dokploy does not use it.
   **External monitor.** Poll `/api/ready` every minute through a route reachable by the monitor (not the public Cloudflare routes unless you accept an unauthenticated status endpoint; the body is only `{"status":"ok"|"degraded"|"unavailable"}`) and alert on any non-200. Also alert on the server log event `action = "sync.alert.slot-lag-critical"` (level `error`, emitted by the 5-minute `sync.slot-lag` job while any slot is critical, so repeated notifications are expected until it recovers). Not covered until phase 8: disk and WAL headroom, snapshot failure, alert routing.
5. **Secrets in logs and URLs.** The bootstrap sets role passwords with `ALTER ROLE ... PASSWORD`; with `log_statement` set to `ddl` or `all` the password appears in the Postgres log, so keep it off (or `none`) around the job. The passwords and the development `POSTGRES_PASSWORD` are placed into connection URLs unescaped by compose: use URL-safe values (the bootstrap env rejects others; `POSTGRES_PASSWORD` is a development default only).
6. **Restore:** [sync restore checklist](sync-restore-checklist.md).

### Trusted proxies and the client IP

Rate limits and the IP in security emails use the client IP. The server takes it from `X-Forwarded-For`, walking from the right and only through hops inside `TRUSTED_PROXIES`. A spoofed leftmost value never wins. Two layers sit in front of the container, so trust both:

1. **Traefik.** The subnet of `dokploy-network`: `docker network inspect dokploy-network --format '{{(index .IPAM.Config 0).Subnet}}'`.
2. **Cloudflare.** Its published ranges, <https://www.cloudflare.com/ips-v4> and <https://www.cloudflare.com/ips-v6>.

```text
TRUSTED_PROXIES=<dokploy-network subnet>,173.245.48.0/20,103.21.244.0/22,...,2400:cb00::/32,...
```

Traefik must also keep the `X-Forwarded-For` that Cloudflare sends instead of replacing it: set `forwardedHeaders.trustedIPs` to the Cloudflare ranges on Traefik's `websecure` entrypoint (Dokploy: Traefik file editor, `traefik.yml`). Verify after deploying: request a password reset from a real network and check that the email shows your address and not a Cloudflare or Docker one. If it shows the wrong one, the chain above is incomplete. Never use `0.0.0.0/0`; with `none` every request is attributed to the immediate peer.

Cloudflare publishes new ranges rarely. Re-check the lists twice a year (the runbook has the reminder).

### Firewall: only Cloudflare reaches the origin

Without this, anyone can call the origin directly with a forged `Cf-Connecting-IP`, skipping Cloudflare's WAF and rate limiting.

- Allow inbound 80/443 only from the Cloudflare ranges above, plus your own address for SSH and the Dokploy panel (port 3000 of the host, not the app).
- Use the cloud provider's firewall (Hetzner, AWS security group, ...) where possible. Docker publishes ports by editing iptables ahead of host firewalls such as `ufw`, so `ufw allow` rules do not restrict Traefik. On a host-only firewall, put the rules in the `DOCKER-USER` chain.
- Alternatively or in addition, enable **Authenticated Origin Pulls** (Cloudflare mTLS to the origin) and require the client certificate in Traefik.

## Web on Cloudflare

`apps/web` builds with `@cloudflare/vite-plugin`: the SSR environment runs in `workerd` in `pnpm dev` too, so what you test is the runtime that ships. `apps/web/wrangler.jsonc` holds the Worker; `pnpm template:init` derives its `name` (`<name>-web`) and `routes` from `app.config.ts` (`name`, `productionUrl`, `cloudflareZone`). Set `cloudflareZone` to the actual DNS zone (for example `example.co.uk`), not an inferred public suffix.

### One-time setup

1. Add the domain's zone to Cloudflare and create a **proxied** (orange cloud) DNS record for the app hostname that points at the Dokploy server's IP.
2. Deploy the Worker once so it exists: `pnpm --filter web build && pnpm --filter web exec wrangler deploy` (log in with `wrangler login`), or let CI do it (below).
3. **Path routes.** The wrangler config declares the Worker route `app.example.com/*`. Cloudflare matches the most specific route, so add two routes in the dashboard (Workers Routes → Add route) with **Worker: None**:

   | Route                   | Worker |
   | ----------------------- | ------ |
   | `app.example.com/api/*` | None   |
   | `app.example.com/rpc/*` | None   |

   Requests for those paths then pass through to the proxied DNS record, which is the Dokploy origin. Wrangler cannot express a route without a Worker, which is why these two live in the dashboard. Check the setup with `curl https://app.example.com/api/health` (`{"status":"ok"}`) and by loading `/` (the Worker).

4. SSL/TLS mode **Full (strict)**.
5. Optional: a WAF rate limit rule for `/api/auth/*` as a second layer behind the in-process limits.

### CI deploy

The `deploy-web` job in `.github/workflows/ci.yml` runs after `checks`, `e2e` and `workflows` pass on `main`: it builds the web app and runs `wrangler deploy`. It is off until you opt in, so a fresh fork does not fail on missing credentials.

| Kind                              | Name                      | Value                                                                |
| --------------------------------- | ------------------------- | -------------------------------------------------------------------- |
| Variable                          | `DEPLOY_WEB`              | `true`                                                               |
| Variable                          | `VITE_SERVER_URL`         | The production origin, same as `productionUrl`.                      |
| Variable                          | `VITE_TURNSTILE_SITE_KEY` | Optional site key.                                                   |
| Secret (environment `production`) | `CLOUDFLARE_API_TOKEN`    | Token with "Edit Cloudflare Workers" scoped to the account and zone. |
| Secret (environment `production`) | `CLOUDFLARE_ACCOUNT_ID`   | The account id.                                                      |

Workflow actions are pinned to commit SHAs and audited with zizmor in CI. When adding one, look up its SHA with `gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha` (dereference annotated tags) and keep the version comment.

## Native

`apps/native/eas.json` has `development`, `preview` and `production` build profiles, each with a channel for EAS Update. App name, version, scheme and bundle ids come from `app.config.ts`. Run `eas init` once, then put the project id in `easProjectId` (or set `EAS_PROJECT_ID`).

```sh
eas build --profile preview --platform all     # internal testing build
eas update --channel production --environment production --message "…"  # explicit production env
eas build --profile production --platform all  # store build; submission stays manual
```

The `production` build profile's `EXPO_PUBLIC_SERVER_URL` comes from `productionUrl` through `pnpm template:init`; set `preview` to your staging origin by hand. OTA publication does not read build-profile `env`: create `EXPO_PUBLIC_SERVER_URL` (and the optional `EXPO_PUBLIC_TURNSTILE_SITE_KEY`) in the EAS **production** environment with the same public values, and always pass `--environment production`. Check `eas env:list --environment production` before publishing; the API origin must match `productionUrl`, never localhost. After changing `app.config.ts`, update those EAS values too. Over-the-air updates only carry JS and assets: a change that needs new native code needs a new build.
