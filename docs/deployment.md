# Deployment

The API has its own host, `api.<domain>`, on Dokploy behind Cloudflare. There is no web app, no Worker and no path routing ([ADR 0033](adr/0033-mobile-first-api-host.md)). The apex domain stays free for a future marketing site.

```text
native app ──► Cloudflare (proxied api.<domain>)  ──► Dokploy: Traefik ──► server container ──► Postgres service
           ──► Cloudflare (proxied sync.<domain>) ──► Dokploy: Traefik ──► PowerSync ─────────► Postgres service
           ──► R2 (presigned URLs, user media)

push to main ──► GitHub Actions: CI ──► image to GHCR ──► Dokploy API: run that image
```

Dokploy never builds: CI builds the server image once and Dokploy runs it ([ADR 0045](adr/0045-build-in-ci-deploy-by-api.md)). New here? Start at [What the owner must do once](#what-the-owner-must-do-once).

The app reaches it through `EXPO_PUBLIC_SERVER_URL`. The server also answers `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association`, which the passkeys need.

Before the first deploy, edit the files that cannot import `app.config.ts` by hand ([README](../README.md#configuring-the-app)): compose names, the server Dockerfile port and the EAS server URLs.

## API server on Dokploy

Four Dokploy pieces in one project: a PostgreSQL database service with a backup destination, the server application (a Docker image from GHCR), and PowerSync as a Compose application. Nothing publishes a host port except Traefik.

### Postgres

1. Create a PostgreSQL 18 database service in the project. Leave its external port unset: it is reachable only on `dokploy-network`.
2. Set the logical-replication flags ([Sync infrastructure](#sync-infrastructure), step 1) and redeploy the service.
3. Create the role the server connects as. The user Dokploy creates is the superuser; the replication bootstrap refuses a superuser as the runtime role in production. In the service's terminal (`psql -U <user> -d <database>`):

   ```sql
   CREATE ROLE vermillion LOGIN PASSWORD '<openssl rand -hex 24>';
   ALTER DATABASE <database> OWNER TO vermillion;
   ```

   `DATABASE_URL` uses this role; `SYNC_ADMIN_DATABASE_URL` uses the superuser and is given only to the bootstrap job.

4. Set up backups before the first user signs up: [runbook](runbook.md#postgres-and-backups).

### Server application

1. Create an **Application**. Source: **Docker**. Image `ghcr.io/<owner>/<repo>-server:latest`, registry URL `ghcr.io`, username and password a GitHub user and a token with `read:packages` (the package is private). The deploy workflow rewrites the image to the commit's tag, with the same credentials, on every deploy.
2. Autodeploy **off**. Only the workflow deploys ([Continuous delivery](#continuous-delivery)).
3. Environment: see [Environment](#environment).
4. Domain: `api.<domain>`, port `3000`, HTTPS (Let's Encrypt), no path prefix. Cloudflare SSL/TLS mode must be **Full (strict)**.
5. Health check: the image declares one against `/api/health` (every 2 seconds while starting, then every 30). Dokploy shows the container unhealthy if it fails. Optional, for a deploy that rolls itself back: Advanced → Cluster Settings → Swarm Settings, Update Config `{"Parallelism":1,"Delay":10000000000,"FailureAction":"rollback","Order":"start-first"}` (Dokploy's "going to production" guide).

The image is built from `apps/server/Dockerfile` with the repository root as context ([ADR 0009](adr/0009-dokploy-dockerfile.md)). It holds the bundled server, the replication bootstrap job (`sync-bootstrap.mjs`) and the migrations, has no `node_modules`, and runs as the `node` user.

The container waits for Postgres, applies migrations (connection passwords are stripped from the startup log), starts the pg-boss workers and only then listens. On `SIGTERM` it stops accepting requests and drains pending email jobs for up to 10 seconds. Run one replica: rate-limit counters live in process memory and jobs run in the server process.

Migrations are additive-only: a release adds columns and tables, a later release removes what is no longer used. The old container keeps working while a deploy replaces it, and a rollback is possible. See [ADR 0007](adr/0007-additive-migrations.md).

### Environment

Validated at startup by `packages/env`; the server exits with the failing variable named. `apps/server/.env.example` lists them all.

| Variable                                                   | Required          | Notes                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                             | yes               | The Postgres service's internal host with the unprivileged `vermillion` role ([Postgres](#postgres)), not the superuser.                                                                                                                                                                             |
| `APP_URL`                                                  | yes               | Public origin of the API, `https://api.example.com`. Auth links, the trusted-origin check and the default passkey RP id use it.                                                                                                                                                                      |
| `BETTER_AUTH_SECRET`                                       | yes               | 32+ chars, `openssl rand -hex 32`. Placeholders are refused in production.                                                                                                                                                                                                                           |
| `TRUSTED_PROXIES`                                          | yes in production | Comma-separated CIDRs allowed to set `X-Forwarded-For`; see below.                                                                                                                                                                                                                                   |
| `REGISTRATION_OPEN`                                        | no                | `false` refuses every unknown address; existing accounts still sign in. Default `true`.                                                                                                                                                                                                              |
| `TURNSTILE_SECRET_KEY`                                     | no                | Enables the CAPTCHA before a sign-in code is sent and on social sign-in. Pair with the site key on native.                                                                                                                                                                                           |
| `AUTH_RP_ID`                                               | no                | Passkey relying-party id (bare hostname). Defaults to the hostname of `APP_URL`. Never change it once users have passkeys.                                                                                                                                                                           |
| `AUTH_PASSKEY_ORIGINS`                                     | no                | Comma-separated origins a passkey ceremony may come from. Defaults to the `APP_URL` origin. Also trusted origins.                                                                                                                                                                                    |
| `ANDROID_CERT_SHA256`                                      | for Android       | Comma-separated SHA-256 fingerprints of the Android signing certificates (the release keystore of the Android release workflow, which prints it in its job summary; EAS keystore; Play app signing key). Adds the `android:apk-key-hash` origins and is published at `/.well-known/assetlinks.json`. |
| `APPLE_TEAM_ID`                                            | for iOS           | Apple Developer team id (10 characters), published at `/.well-known/apple-app-site-association`.                                                                                                                                                                                                     |
| `GOOGLE_CLIENT_ID`/`_SECRET`, `GITHUB_CLIENT_ID`/`_SECRET` | no                | A provider is enabled only when both of its values are set.                                                                                                                                                                                                                                          |
| `RESEND_API_KEY`, `EMAIL_FROM`                             | production        | Without a key emails are printed to the log. `EMAIL_CONSOLE=true` forces that in production (throwaway stacks only).                                                                                                                                                                                 |

Sync infrastructure (PowerSync):

| Variable                                                       | Required   | Notes                                                                                                                                                                   |
| -------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POWERSYNC_REPLICATION_PASSWORD`, `POWERSYNC_STORAGE_PASSWORD` | for sync   | Bootstrap job and PowerSync service. 16+ URL-safe characters (`openssl rand -hex 24`). Placeholders are refused in production.                                          |
| `SYNC_ADMIN_DATABASE_URL`                                      | production | Bootstrap job only: a role with CREATEROLE, CREATEDB and REPLICATION (or superuser). Not the runtime role. Never give it to the server.                                 |
| `SYNC_ENDPOINT_URL`                                            | prod       | Public PowerSync URL (the `sync.` subdomain) returned by `sync.credentials`. Unset in development uses `127.0.0.1:8090`; unset in production disables sync credentials. |
| `SYNC_SLOT_LAG_WARN_MB`, `SYNC_SLOT_LAG_CRITICAL_MB`           | no         | Slot lag thresholds. Defaults 1024 and 3072. Critical marks `/api/ready` degraded.                                                                                      |

User media (the private bucket, [ADR 0040](adr/0040-user-media.md)):

| Variable                                               | Required   | Notes                                                                                                                                                       |
| ------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEDIA_S3_ENDPOINT`                                    | production | S3 API of the bucket: `https://<account id>.r2.cloudflarestorage.com`. Development defaults to the MinIO of `docker-compose.yml` (`http://127.0.0.1:9000`). |
| `MEDIA_S3_BUCKET`                                      | production | The private R2 bucket (`vermillion-user-media` in development). No public access, no custom domain, no CORS rules: the app only uses presigned URLs.        |
| `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY` | production | An R2 API token scoped to this one bucket with Object Read & Write. The development MinIO secret is refused in production.                                  |
| `MEDIA_S3_REGION`                                      | no         | Default `auto` (what R2 expects).                                                                                                                           |

R2 setup: create the bucket (no public access), create an API token limited to it, put the four values on the server service. Objects live under `users/<userId>/`; account deletion and the hourly `media.purge-objects` job delete them. The bucket is a processor of health-adjacent data: keep it on the [privacy readiness](privacy-readiness.md) checklist.

### Sync infrastructure

1. **Postgres flags.** Set on the Postgres service (Dokploy: Advanced, command arguments): `-c wal_level=logical -c max_wal_senders=10 -c max_replication_slots=10 -c max_slot_wal_keep_size=<budget>`. Changing `wal_level` needs a restart. The development value (4GB) is not a production sizing; size it from write rate and outage plus resnapshot time ([ADR 0025](adr/0025-sync-observability.md)).
2. **Bootstrap job.** A one-shot from the server image: `node sync-bootstrap.mjs`, with `NODE_ENV=production`, `DATABASE_URL`, `SYNC_ADMIN_DATABASE_URL` and the two `POWERSYNC_*_PASSWORD` values. It is idempotent and exits non-zero on any preflight failure. Run it before the first server deploy (the migrations need the publication it creates) and again when a release changes the bootstrap. On the Dokploy host, with the values in a root-only file:

   ```sh
   docker login ghcr.io -u <github user>      # the read:packages token as the password
   docker run --rm --network dokploy-network --env-file /root/sync-bootstrap.env \
     ghcr.io/<owner>/<repo>-server:latest node sync-bootstrap.mjs
   ```

3. **PowerSync service.** A Dokploy **Compose** application from this repository, compose path `powersync/compose.dokploy.yml`. It pins `journeyapps/powersync-service:1.28.1` by digest, mounts `powersync/service.yaml` and `powersync/sync-config.yaml`, joins `dokploy-network` and publishes no host port. Set its environment (listed at the top of that file): `POSTGRES_HOST`, `POSTGRES_DB`, the two `POWERSYNC_*_PASSWORD` values, `PS_SSLMODE` (`verify-full`, or `verify-ca` with a `cacert` added to the connection in `powersync/service.yaml`; `disable` only when Postgres has no TLS on the private network; PowerSync 1.28.1 has no `require`), `PS_JWKS_URI` (the API's internal `http://<server application name>:3000/api/auth/jwks`) and `PS_ADMIN_TOKEN`. Autodeploy stays off: redeploy it by hand after a change to `powersync/` has been deployed to the server (order below).
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

## Continuous delivery

`.github/workflows/deploy-server.yml` runs on a push to `main` that touches the server image (`apps/server`, the packages the server uses, `app.config.ts`, the lockfile) and by hand (Actions → Deploy server → Run workflow).

1. **CI.** It runs the jobs of `ci.yml` for that commit and stops if one fails.
2. **Image.** Buildx builds `apps/server/Dockerfile` with the GitHub Actions layer cache and pushes `ghcr.io/<owner>/<repo>-server:<commit sha>` and `:latest`.
3. **Deploy.** In the `production` environment (add required reviewers to make it wait for an approval), it calls the Dokploy API with `x-api-key`: `application.saveDockerProvider` sets the application's image to the commit's tag, `application.deploy` queues the deployment, and the job polls `deployment.all` until that deployment is `done` or `error`. A missing secret fails the job by name; responses are never printed.

| Secret (environment `production`) | Value                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `DOKPLOY_URL`                     | The panel's HTTPS origin, reachable from GitHub (`https://dokploy.<domain>`), no path.      |
| `DOKPLOY_API_KEY`                 | Dokploy → profile → API/CLI keys.                                                           |
| `DOKPLOY_APPLICATION_ID`          | The server application's id (the last part of its URL in the panel).                        |
| `GHCR_PULL_USERNAME`              | The GitHub user that owns the token below.                                                  |
| `GHCR_PULL_TOKEN`                 | A classic personal access token with only `read:packages`. Dokploy pulls the image with it. |

GitHub's runners must reach the Dokploy API, so the panel needs a proxied hostname behind Cloudflare (Dokploy → Settings → Server domain) instead of the host's port 3000, which the firewall keeps closed.

Workflow actions are pinned to commit SHAs and audited with zizmor in CI. When adding one, look up its SHA with `gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha` (dereference annotated tags) and keep the version comment.

## Local production check

`compose.prod.yml` runs the production image on your machine against Postgres 18 with the logical-WAL flags, the replication bootstrap, PowerSync and MinIO in place of R2. Use it before the first deploy and after a change to the Dockerfile, startup, env schema or `powersync/`. It has its own project name, volumes and ports (API 13000, PowerSync 18090), so it runs beside the development stack.

```sh
cp .env.prod.example .env.prod      # git ignores it; replace every REPLACE_ value as the file says
docker compose -p vermillion-prodcheck --env-file .env.prod -f compose.prod.yml up -d --build --wait
curl http://127.0.0.1:13000/api/health           # {"status":"ok"}
curl http://127.0.0.1:13000/api/ready            # {"status":"ok"}
curl http://127.0.0.1:18090/probes/readiness     # {"ready":true,...}
docker compose -p vermillion-prodcheck --env-file .env.prod -f compose.prod.yml down -v
```

`up --wait` returns once the server has migrated and is healthy and PowerSync is ready. The server and the bootstrap run with `NODE_ENV=production`, so placeholders are refused and the server's database role must be unprivileged, as in production. Sign-in codes are printed to the server log (`EMAIL_CONSOLE=true`). MinIO has no host port: presigned URLs name `minio:9000` and work only inside the stack's network. If Docker answers "all predefined address pools have been fully subnetted", remove unused networks (`docker network prune`) or add a compose override that gives the default network a free subnet.

## What the owner must do once

In this order. Each step names what to create; nothing here is in the repo.

**Cloudflare and the server**

1. Add the domain's zone. Create proxied records `api`, `sync` and `dokploy` pointing at the server. SSL/TLS mode Full (strict). ([Cloudflare](#cloudflare))
2. Install Dokploy on the server. Settings → Server domain: `dokploy.<domain>` with HTTPS.
3. Firewall: inbound 80/443 only from Cloudflare's ranges, SSH from your address. ([Firewall](#firewall-only-cloudflare-reaches-the-origin))

**R2**

4. Bucket for user media (private) and an API token scoped to it: `MEDIA_S3_ENDPOINT`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY`.
5. A second private bucket for database backups and its own token.

**Postgres (Dokploy)**

6. Create the PostgreSQL 18 service, set the four `-c` flags, create the `vermillion` role. ([Postgres](#postgres))
7. Destinations → add the backup bucket. Backups → daily schedule. Run one backup by hand and the restore drill. ([runbook](runbook.md#postgres-and-backups))

**GitHub**

8. Create a classic personal access token with only `read:packages`.
9. Settings → Environments → `production`: add yourself as a required reviewer and limit deployment branches to `main`.
10. In that environment add the secrets `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_APPLICATION_ID`, `GHCR_PULL_USERNAME`, `GHCR_PULL_TOKEN` (the Dokploy values come from steps 12 and 13).
11. Actions → Deploy server → Run workflow on `main`. The image job pushes the first image to GHCR; leave the deploy job waiting for approval.

**Server (Dokploy)**

12. Create the server application: Docker source, `ghcr.io/<owner>/<repo>-server:latest`, registry `ghcr.io` with the user and token of step 8, autodeploy off, domain `api.<domain>` port 3000. Copy its id.
13. Profile → API/CLI keys: create the API key.
14. Generate the secrets: `BETTER_AUTH_SECRET` (`openssl rand -hex 32`), `POWERSYNC_REPLICATION_PASSWORD` and `POWERSYNC_STORAGE_PASSWORD` (`openssl rand -hex 24`), `PS_ADMIN_TOKEN` (`openssl rand -hex 32`).
15. Set the application's environment: `NODE_ENV=production`, `DATABASE_URL` (the `vermillion` role), `APP_URL=https://api.<domain>`, `BETTER_AUTH_SECRET`, `TRUSTED_PROXIES`, `SYNC_ENDPOINT_URL=https://sync.<domain>`, the four `MEDIA_S3_*` values, `RESEND_API_KEY` and `EMAIL_FROM` (after verifying the sending domain in Resend). ([Environment](#environment))
16. Run the bootstrap job on the host. ([Sync infrastructure](#sync-infrastructure), step 2)
17. Approve the waiting deploy job (or run the workflow again). Check `curl https://api.<domain>/api/health` and `/api/ready`.
18. Traefik: keep Cloudflare's `X-Forwarded-For`, then verify the client IP. ([Trusted proxies](#trusted-proxies-and-the-client-ip))

**PowerSync (Dokploy)**

19. Create the Compose application from `powersync/compose.dokploy.yml`, set its environment, give the `powersync` service the domain `sync.<domain>` port 8080, deploy. Check `curl https://sync.<domain>/probes/readiness`.
20. Point an external monitor at `/api/ready`. ([Sync infrastructure](#sync-infrastructure), step 4)

**Android app**

21. Create the release keystore and back it up. Add the secrets `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_STORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD` and the variable `EXPO_PUBLIC_SERVER_URL=https://api.<domain>` (repository level). ([Android release](guides/android-release.md))
22. Set `ANDROID_CERT_SHA256` on the server application to the keystore's SHA-256 fingerprint and deploy. Check `curl https://api.<domain>/.well-known/assetlinks.json`.
23. Actions → Android release → Run workflow on `main` (fills the Gradle cache, gives a test APK). Then tag `v<version>` to publish a release.

## Native

A signed Android APK for direct installs is built on GitHub Actions and attached to a GitHub Release when a `v*` tag is pushed: [Android release](guides/android-release.md). Store builds go through EAS:

`apps/native/eas.json` has `development`, `preview` and `production` build profiles, each with a channel for EAS Update. App name, version, scheme and bundle ids come from `app.config.ts`. Run `eas init` once, then put the project id in `easProjectId` (or set `EAS_PROJECT_ID`).

```sh
eas build --profile preview --platform all     # internal testing build
eas update --channel production --environment production --message "…"  # explicit production env
eas build --profile production --platform all  # store build; submission stays manual
```

Set `EXPO_PUBLIC_SERVER_URL` in each build profile of `eas.json` by hand: `https://api.<domain>` for `production` and your staging API for `preview`. OTA publication does not read build-profile `env`: create `EXPO_PUBLIC_SERVER_URL` (and the optional `EXPO_PUBLIC_TURNSTILE_SITE_KEY`) in the EAS **production** environment with the same public values, and always pass `--environment production`. Check `eas env:list --environment production` before publishing; the API origin must be the production API host, never localhost. If the host changes, update those EAS values too. Over-the-air updates only carry JS and assets: a change that needs new native code needs a new build.
