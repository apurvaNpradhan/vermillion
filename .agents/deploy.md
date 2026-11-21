# Deploy

Details live in the docs; this page says where things run.

- Server (`basalt-api.<domain>`): CI builds `apps/server/Dockerfile` once and pushes it to GHCR; `.github/workflows/deploy-server.yml` then points the Dokploy application (Docker image source, autodeploy off) at that commit's tag through the Dokploy API ([ADR 0045](../docs/adr/0045-build-in-ci-deploy-by-api.md)). Migrates on start, then seeds an empty catalog. Behind Cloudflare.
- Postgres: a separate Dokploy database service, backed up to R2. The server connects as an unprivileged role.
- PowerSync: a Dokploy Compose application from `powersync/compose.dokploy.yml`, on `basalt-sync.<domain>`. Redeployed by hand.
- User media: a private R2 bucket (MinIO in development and in the local production check).
- Android APK: `.github/workflows/android-release.yml` on a `v*` tag, signed with the keystore from secrets ([guide](../docs/guides/android-release.md)).
- Native store builds: EAS profiles in `apps/native/eas.json`, EAS Update for JS fixes, store submission manual.
- Public website (`apps/web`, site host from `app.config.ts`): TanStack Start, prerendered, deployed to a Cloudflare Worker by `.github/workflows/deploy-web.yml` with Wrangler ([ADR 0052](../docs/adr/0052-public-website-on-workers.md)). Public pages only: landing, privacy, terms, delete-account.
- Catalog media: the public R2 bucket on `media.<domain>`; the admin uploads to it with presigned URLs.
- Hosts derive from `domain` in `app.config.ts`: site `basalt.`, API `basalt-api.`, sync `basalt-sync.`, media `media.`.

Read [docs/deployment.md](../docs/deployment.md) to set up, [docs/runbook.md](../docs/runbook.md) to operate.

## When you change

- Env variables: update `.env.example`, `packages/env`, `turbo.json`, deployment.md.
- The site host: `apps/web/wrangler.jsonc` holds it as a custom-domain route; `pnpm --filter web check:host` compares it with `app.config.ts` and the deploy workflow runs it. Edit both together.
- Workflow actions: pin to a commit SHA (`gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha`, dereference annotated tags), keep the version comment, run `zizmor`.
- Migrations: additive-only.
- Derived names (compose, Dockerfile port, EAS URLs, workflow variables): edit them by hand after changing `app.config.ts`.
- The Dockerfile, server startup, env schema or `powersync/`: run the local production check (`compose.prod.yml`, own project `vermillion-prodcheck`, [steps](../docs/deployment.md#local-production-check)) and add new variables to `compose.prod.yml` and `.env.prod.example`.
- A package the server starts or stops using: update the `paths` of `deploy-server.yml`.
- The base domain: follow "Moving to the final domain" in docs/deployment.md.
- The Expo template (SDK upgrade): `apps/native/plugins/with-release-signing.js` patches `app/build.gradle`; its test holds the expected shape.
