# Deploy

Details live in the docs; this page says where things run.

- Web: Cloudflare Worker (`apps/web`, `wrangler.jsonc`), deployed by the `deploy-web` job in `.github/workflows/ci.yml` after checks pass on `main`.
- Server: Dokploy application built from `apps/server/Dockerfile`, with a separate Postgres service. Migrates on start.
- Cloudflare routes `/api/*` and `/rpc/*` to the Dokploy origin; everything else hits the Worker. One hostname.
- Native: EAS profiles in `apps/native/eas.json`, EAS Update for JS fixes, store submission manual.

Read [docs/deployment.md](../docs/deployment.md) to set up, [docs/runbook.md](../docs/runbook.md) to operate.

## When you change

- Env variables: update `.env.example`, `packages/env`, `turbo.json`, deployment.md.
- Workflow actions: pin to a commit SHA (`gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha`, dereference annotated tags), keep the version comment, run `zizmor`.
- Migrations: additive-only.
- Derived names (compose, wrangler, EAS URLs): edit `app.config.ts` and run `pnpm template:init`.
