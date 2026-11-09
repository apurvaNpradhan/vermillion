# Deploy

Details live in the docs; this page says where things run.

- Server: Dokploy application built from `apps/server/Dockerfile`, with a separate Postgres service. Migrates on start. Served at `api.<domain>` behind Cloudflare; autodeploy follows `main`.
- Native: EAS profiles in `apps/native/eas.json`, EAS Update for JS fixes, store submission manual.
- The server also answers `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` for passkeys.
- There is no web app and no Worker ([ADR 0033](../docs/adr/0033-mobile-first-api-host.md)).

Read [docs/deployment.md](../docs/deployment.md) to set up, [docs/runbook.md](../docs/runbook.md) to operate.

## When you change

- Env variables: update `.env.example`, `packages/env`, `turbo.json`, deployment.md.
- Workflow actions: pin to a commit SHA (`gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha`, dereference annotated tags), keep the version comment, run `zizmor`.
- Migrations: additive-only.
- Derived names (compose, Dockerfile port, EAS URLs): edit them by hand after changing `app.config.ts`.
