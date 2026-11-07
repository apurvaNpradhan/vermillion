# 0009. The server deploys from a Dockerfile

Status: accepted (2026-11-06). Made while writing the deploy docs; the spec left "Dockerfile or Nixpacks" open.

## Context

Dokploy can build with Nixpacks or a Dockerfile. The server is a pnpm monorepo app whose workspace packages are bundled by tsdown.

## Decision

`apps/server/Dockerfile` (build context: the repository root) installs `server...` with the frozen lockfile, builds with tsdown and copies `dist/` into a bare `node:24-slim`. tsdown bundles every dependency and copies the migrations next to the bundle, so the runtime image has no `node_modules`. The image runs as the `node` user and declares a health check on `/api/health`.

## Consequences

- Reproducible builds with the repo's pnpm version; no Nixpacks guessing about the monorepo.
- A dependency that cannot be bundled (native addon) must be added to `deps.neverBundle` and installed in the runtime stage.
