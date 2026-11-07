# API server image for Dokploy. Build context is the repository root:
#   docker build -f apps/server/Dockerfile .
FROM node:24-slim AS build
RUN npm install -g pnpm@12.15.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter server... --ignore-scripts
# tsdown bundles every dependency, so dist/ runs without node_modules.
RUN pnpm --filter server build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/server/dist ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "index.mjs"]
