# syntax=docker/dockerfile:1
# API server image. CI builds it and pushes it to GHCR; Dokploy runs that image (ADR 0045).
# Build context is the repository root:
#   docker build -f apps/server/Dockerfile .
# Only the files that decide what gets installed, so the install layer below is reused until a
# manifest, the lockfile or a patch changes.
FROM node:24-slim AS manifests
WORKDIR /repo
COPY . .
RUN find . -type f \
  ! -name package.json ! -name pnpm-lock.yaml ! -name pnpm-workspace.yaml ! -path './patches/*' \
  -delete \
  && find . -type d -empty -delete

FROM node:24-slim AS build
RUN npm install -g pnpm@12.15.0
WORKDIR /repo
COPY --from=manifests /repo ./
# The server and the workspace packages it depends on; the native app's dependencies stay out.
RUN pnpm install --frozen-lockfile --filter server... --ignore-scripts
COPY . .
# tsdown bundles every dependency, so dist/ runs without node_modules. It holds the server
# (index.mjs), the replication bootstrap job (sync-bootstrap.mjs) and the migrations.
RUN pnpm --filter server build \
  && test -f apps/server/dist/index.mjs \
  && test -f apps/server/dist/sync-bootstrap.mjs \
  && test -d apps/server/dist/migrations

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/server/dist ./
USER node
EXPOSE 3000
# Liveness only. The first probes come every 2 seconds, so a deploy sees "healthy" as soon as
# the server has migrated and listens instead of after the first 30-second interval.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --start-interval=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "index.mjs"]
