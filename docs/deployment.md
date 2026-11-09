# Deployment

The API has its own host, `api.<domain>`, on Dokploy behind Cloudflare. There is no web app, no Worker and no path routing ([ADR 0033](adr/0033-mobile-first-api-host.md)). The apex domain stays free for a future marketing site.

```text
native app ──► Cloudflare (proxied api.<domain>) ──► Dokploy: Traefik ──► server container ──► Postgres service
```

The app reaches it through `EXPO_PUBLIC_SERVER_URL`. The server also answers `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association`, which the passkeys need.

Before the first deploy, edit the files that cannot import `app.config.ts` by hand ([README](../README.md#configuring-the-app)): compose names, the server Dockerfile port and the EAS server URLs.

## API server on Dokploy

Three Dokploy pieces in one project: a PostgreSQL database service, the server application, and (optional) a backup destination. Nothing publishes a host port except Traefik.

### Postgres

1. Create a PostgreSQL 18 database service in the project. Leave its external port unset: it is reachable only on `dokploy-network`.
2. Set up backups first: [runbook](runbook.md#postgres-and-backups).

### Server application

1. Create an **Application** from this GitHub repository, branch `main`.
2. Build type **Dockerfile**: Dockerfile path `apps/server/Dockerfile`, docker context path `.` (the repo root). The image bundles every dependency, so it carries no `node_modules`; Nixpacks was not chosen because it would have to guess a monorepo build (see [ADR 0009](adr/0009-dokploy-dockerfile.md)).
3. Autodeploy **on**. CI does not gate the server: if you need it gated, turn Autodeploy off and call Dokploy's deploy webhook from a workflow step.
4. Environment: see [Environment](#environment).
5. Domain: `api.<domain>`, port `3000`, HTTPS (Let's Encrypt), no path prefix. Cloudflare SSL/TLS mode must be **Full (strict)**.
6. Health check: the image declares one against `/api/health`. Dokploy shows the container unhealthy if it fails.

The container waits for Postgres, applies migrations (connection passwords are stripped from the startup log), starts the pg-boss workers and only then listens. On `SIGTERM` it stops accepting requests and drains pending email jobs for up to 10 seconds. Run one replica: rate-limit counters live in process memory and jobs run in the server process.

Migrations are additive-only: a release adds columns and tables, a later release removes what is no longer used. The old container keeps working while a deploy replaces it, and a rollback is possible. See [ADR 0007](adr/0007-additive-migrations.md).

### Environment

Validated at startup by `packages/env`; the server exits with the failing variable named. `apps/server/.env.example` lists them all.

| Variable                                                   | Required          | Notes                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                             | yes               | The Postgres service's internal connection string.                                                                                                                                                         |
| `APP_URL`                                                  | yes               | Public origin of the API, `https://api.example.com`. Auth links, the trusted-origin check and the default passkey RP id use it.                                                                            |
| `BETTER_AUTH_SECRET`                                       | yes               | 32+ chars, `openssl rand -hex 32`. Placeholders are refused in production.                                                                                                                                 |
| `TRUSTED_PROXIES`                                          | yes in production | Comma-separated CIDRs allowed to set `X-Forwarded-For`; see below.                                                                                                                                         |
| `REGISTRATION_OPEN`                                        | no                | `false` refuses every unknown address; existing accounts still sign in. Default `true`.                                                                                                                    |
| `TURNSTILE_SECRET_KEY`                                     | no                | Enables the CAPTCHA before a sign-in code is sent and on social sign-in. Pair with the site key on native.                                                                                                 |
| `AUTH_RP_ID`                                               | no                | Passkey relying-party id (bare hostname). Defaults to the hostname of `APP_URL`. Never change it once users have passkeys.                                                                                 |
| `AUTH_PASSKEY_ORIGINS`                                     | no                | Comma-separated origins a passkey ceremony may come from. Defaults to the `APP_URL` origin. Also trusted origins.                                                                                          |
| `ANDROID_CERT_SHA256`                                      | for Android       | Comma-separated SHA-256 fingerprints of the Android signing certificates (EAS keystore, Play app signing key). Adds the `android:apk-key-hash` origins and is published at `/.well-known/assetlinks.json`. |
| `APPLE_TEAM_ID`                                            | for iOS           | Apple Developer team id (10 characters), published at `/.well-known/apple-app-site-association`.                                                                                                           |
| `GOOGLE_CLIENT_ID`/`_SECRET`, `GITHUB_CLIENT_ID`/`_SECRET` | no                | A provider is enabled only when both of its values are set.                                                                                                                                                |
| `RESEND_API_KEY`, `EMAIL_FROM`                             | production        | Without a key emails are printed to the log. `EMAIL_CONSOLE=true` forces that in production (throwaway stacks only).                                                                                       |

Sync infrastructure (PowerSync, phase 2; the sync features themselves are not live yet):

| Variable                                                       | Required   | Notes                                                                                                                                                                   |
| -------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POWERSYNC_REPLICATION_PASSWORD`, `POWERSYNC_STORAGE_PASSWORD` | for sync   | Bootstrap job and PowerSync service. 16+ URL-safe characters (`openssl rand -hex 24`). Placeholders are refused in production.                                          |
| `SYNC_ADMIN_DATABASE_URL`                                      | production | Bootstrap job only: a role with CREATEROLE, CREATEDB and REPLICATION (or superuser). Not the runtime role. Never give it to the server.                                 |
| `SYNC_ENDPOINT_URL`                                            | prod       | Public PowerSync URL (the `sync.` subdomain) returned by `sync.credentials`. Unset in development uses `127.0.0.1:8090`; unset in production disables sync credentials. |
| `SYNC_SLOT_LAG_WARN_MB`, `SYNC_SLOT_LAG_CRITICAL_MB`           | no         | Slot lag thresholds. Defaults 1024 and 3072. Critical marks `/api/ready` degraded.                                                                                      |

### Sync infrastructure

1. **Postgres flags.** Set on the Postgres service (Dokploy: Advanced, command arguments): `-c wal_level=logical -c max_wal_senders=10 -c max_replication_slots=10 -c max_slot_wal_keep_size=<budget>`. Changing `wal_level` needs a restart. The development value (4GB) is not a production sizing; size it from write rate and outage plus resnapshot time ([ADR 0025](adr/0025-sync-observability.md)).
2. **Bootstrap job.** After the server image is built and Postgres has the flags, run once per deploy (idempotent) as a one-shot from the same image: `node sync-bootstrap.mjs`, with `DATABASE_URL`, `SYNC_ADMIN_DATABASE_URL` and the two `POWERSYNC_*_PASSWORD` values. It exits non-zero on any preflight failure.
3. **PowerSync service.** A Dokploy Compose application on the same network: image `journeyapps/powersync-service:1.28.1@sha256:4955ebd8218d076f23296750f658c2973ce1dcd2ba49a6c7a7c3320acf97325c`, command `start -r unified`, `powersync/service.yaml` and `powersync/sync-config.yaml` mounted at `/config`, environment as in `docker-compose.yml` (`PS_PORT`, `PS_SSLMODE`, `PS_DATA_SOURCE_URI`, `PS_STORAGE_SOURCE_URI`, `PS_JWKS_URI`, `PS_ADMIN_TOKEN`) with production values (`PS_SSLMODE=verify-full`, or `verify-ca` with a `cacert` added to the connection in `powersync/service.yaml`; PowerSync 1.28.1 has no `require`. `PS_JWKS_URI` the API's internal `/api/auth/jwks`). No host port: expose it only on the `sync.` subdomain (below).
   PowerSync service variables: `PS_PORT` (8080 in the container), `PS_SSLMODE` (`disable` in development, otherwise `verify-full` or `verify-ca`), `PS_DATA_SOURCE_URI` (`postgresql://powersync_replication:<password>@<host>:5432/<app db>`), `PS_STORAGE_SOURCE_URI` (same host, user `powersync_storage`, database `powersync_storage`), `PS_JWKS_URI`, `PS_ADMIN_TOKEN` (a generated secret). <!-- secret-scan:allow -->
4. **Probes.** PowerSync's `/probes/readiness` is its Dokploy health check. The server keeps `/api/health` (liveness). Point an external monitor at `/api/ready`: it returns 503 when a replication slot is invalidated or its lag reaches the critical threshold. A restart does not fix either, which is why Dokploy does not use it.
   **External monitor.** Poll `/api/ready` every minute through a route reachable by the monitor (not the public API host unless you accept an unauthenticated status endpoint; the body is only `{"status":"ok"|"degraded"|"unavailable"}`) and alert on any non-200. Also alert on the server log event `action = "sync.alert.slot-lag-critical"` (level `error`, emitted by the 5-minute `sync.slot-lag` job while any slot is critical, so repeated notifications are expected until it recovers). Still to set up in your monitor (no repo support): disk and WAL headroom, PowerSync snapshot failure, alert routing. Response steps: [sync runbook](runbooks/sync.md).
5. **Secrets in logs and URLs.** The bootstrap sets role passwords with `ALTER ROLE ... PASSWORD`; with `log_statement` set to `ddl` or `all` the password appears in the Postgres log, so keep it off (or `none`) around the job. The passwords and the development `POSTGRES_PASSWORD` are placed into connection URLs unescaped by compose: use URL-safe values (the bootstrap env rejects others; `POSTGRES_PASSWORD` is a development default only).
6. **Restore:** [sync restore checklist](sync-restore-checklist.md).

#### Sync subdomain

PowerSync is a long-lived streaming connection with bearer tokens, so it gets its own subdomain instead of sharing the API host ([ADR 0017](adr/0017-sync-credentials-and-transport.md)).

1. DNS: a proxied record `sync.example.com` pointing at the Dokploy server; Traefik routes it to the PowerSync container port. Set `SYNC_ENDPOINT_URL=https://sync.example.com` on the server; clients get it from `sync.credentials`, never from a build constant.
2. The firewall rules above apply unchanged (only Cloudflare reaches the origin).
3. Before rollout verify on this hostname: a stream stays open past Cloudflare's idle timeout and reconnects, and the proxy does not buffer the stream. These are unverified in this repo.

#### Order of operations

1. Postgres flags set (restart if `wal_level` changed).
2. Run the bootstrap job (idempotent, every deploy). It creates the roles and the empty `powersync` publication, which a synced table's migration needs to exist.
3. Deploy the server: migrations run on start, including each synced table's `ALTER PUBLICATION` and grant.
4. Start or update PowerSync with its stream config. A stream for a table that is not yet in the publication breaks replication, so ship the migration first.
5. Release clients last. Rollback is code or config only; schema stays forward-compatible.

#### Tokens and JWKS

Better Auth's `jwt()` plugin signs 5-minute EdDSA (Ed25519) tokens, `aud: powersync`, issuer the app origin. PowerSync fetches `PS_JWKS_URI` (the API's internal `/api/auth/jwks`) lazily on the first token, so it boots before the API is reachable. Keys live in the `jwks` table and rotate every 30 days. Deleting a session does not revoke an issued token; exposure is bounded by the 5-minute expiry. Keep `PS_JWKS_URI` on the internal network and do not publish `PS_ADMIN_TOKEN`.

### Trusted proxies and the client IP

Rate limits and the IP in security emails use the client IP. The server takes it from `X-Forwarded-For`, walking from the right and only through hops inside `TRUSTED_PROXIES`. A spoofed leftmost value never wins. Two layers sit in front of the container, so trust both:

1. **Traefik.** The subnet of `dokploy-network`: `docker network inspect dokploy-network --format '{{(index .IPAM.Config 0).Subnet}}'`.
2. **Cloudflare.** Its published ranges, <https://www.cloudflare.com/ips-v4> and <https://www.cloudflare.com/ips-v6>.

```text
TRUSTED_PROXIES=<dokploy-network subnet>,173.245.48.0/20,103.21.244.0/22,...,2400:cb00::/32,...
```

Traefik must also keep the `X-Forwarded-For` that Cloudflare sends instead of replacing it: set `forwardedHeaders.trustedIPs` to the Cloudflare ranges on Traefik's `websecure` entrypoint (Dokploy: Traefik file editor, `traefik.yml`). Verify after deploying: request a sign-in code from a real network and check that the email shows your address and not a Cloudflare or Docker one. If it shows the wrong one, the chain above is incomplete. Never use `0.0.0.0/0`; with `none` every request is attributed to the immediate peer.

Cloudflare publishes new ranges rarely. Re-check the lists twice a year (the runbook has the reminder).

### Firewall: only Cloudflare reaches the origin

Without this, anyone can call the origin directly with a forged `Cf-Connecting-IP`, skipping Cloudflare's WAF and rate limiting.

- Allow inbound 80/443 only from the Cloudflare ranges above, plus your own address for SSH and the Dokploy panel (port 3000 of the host, not the app).
- Use the cloud provider's firewall (Hetzner, AWS security group, ...) where possible. Docker publishes ports by editing iptables ahead of host firewalls such as `ufw`, so `ufw allow` rules do not restrict Traefik. On a host-only firewall, put the rules in the `DOCKER-USER` chain.
- Alternatively or in addition, enable **Authenticated Origin Pulls** (Cloudflare mTLS to the origin) and require the client certificate in Traefik.

## Cloudflare

1. Add the domain's zone to Cloudflare and create a **proxied** (orange cloud) DNS record `api` that points at the Dokploy server's IP.
2. SSL/TLS mode **Full (strict)**.
3. Check it with `curl https://api.example.com/api/health` (`{"status":"ok"}`) and `curl https://api.example.com/.well-known/assetlinks.json` (404 until `ANDROID_CERT_SHA256` is set).
4. Optional: a WAF rate limit rule for `/api/auth/*` as a second layer behind the in-process limits.

Workflow actions are pinned to commit SHAs and audited with zizmor in CI. When adding one, look up its SHA with `gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha` (dereference annotated tags) and keep the version comment. CI runs checks only; nothing deploys from it.

## Native

`apps/native/eas.json` has `development`, `preview` and `production` build profiles, each with a channel for EAS Update. App name, version, scheme and bundle ids come from `app.config.ts`. Run `eas init` once, then put the project id in `easProjectId` (or set `EAS_PROJECT_ID`).

```sh
eas build --profile preview --platform all     # internal testing build
eas update --channel production --environment production --message "…"  # explicit production env
eas build --profile production --platform all  # store build; submission stays manual
```

Set `EXPO_PUBLIC_SERVER_URL` in each build profile of `eas.json` by hand: `https://api.<domain>` for `production` and your staging API for `preview`. OTA publication does not read build-profile `env`: create `EXPO_PUBLIC_SERVER_URL` (and the optional `EXPO_PUBLIC_TURNSTILE_SITE_KEY`) in the EAS **production** environment with the same public values, and always pass `--environment production`. Check `eas env:list --environment production` before publishing; the API origin must be the production API host, never localhost. If the host changes, update those EAS values too. Over-the-air updates only carry JS and assets: a change that needs new native code needs a new build.
