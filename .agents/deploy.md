# Deploy

Details live in the docs; this page says where things run.

- Server: CI builds `apps/server/Dockerfile` once and pushes it to GHCR; `.github/workflows/deploy-server.yml` then points the Dokploy application (Docker image source, autodeploy off) at that commit's tag through the Dokploy API ([ADR 0045](../docs/adr/0045-build-in-ci-deploy-by-api.md)). Migrates on start. Served at `api.<domain>` behind Cloudflare.
- Postgres: a separate Dokploy database service, backed up to R2. The server connects as an unprivileged role.
- PowerSync: a Dokploy Compose application from `powersync/compose.dokploy.yml`, on `sync.<domain>`. Redeployed by hand.
- User media: a private R2 bucket (MinIO in development and in the local production check).
- Android APK: `.github/workflows/android-release.yml` on a `v*` tag, signed with the keystore from secrets ([guide](../docs/guides/android-release.md)).
- Native store builds: EAS profiles in `apps/native/eas.json`, EAS Update for JS fixes, store submission manual.
- The server also answers `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` for passkeys.
- There is no web app and no Worker ([ADR 0033](../docs/adr/0033-mobile-first-api-host.md)).

Read [docs/deployment.md](../docs/deployment.md) to set up, [docs/runbook.md](../docs/runbook.md) to operate.

## When you change

- Env variables: update `.env.example`, `packages/env`, `turbo.json`, deployment.md.
- Workflow actions: pin to a commit SHA (`gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha`, dereference annotated tags), keep the version comment, run `zizmor`.
- Migrations: additive-only.
- Derived names (compose, Dockerfile port, EAS URLs): edit them by hand after changing `app.config.ts`.
- The Dockerfile, server startup, env schema or `powersync/`: run the local production check (`compose.prod.yml`, own project `vermillion-prodcheck`, [steps](../docs/deployment.md#local-production-check)) and add new variables to `compose.prod.yml` and `.env.prod.example`.
- A package the server starts or stops using: update the `paths` of `deploy-server.yml`.
- The Expo template (SDK upgrade): `apps/native/plugins/with-release-signing.js` patches `app/build.gradle`; its test holds the expected shape.
