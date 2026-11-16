# 0045. The server image is built in CI and deployed through the Dokploy API

Status: accepted (2026-11-17). Supersedes the "Dokploy builds from `main` with autodeploy" part of
[0009](0009-dokploy-dockerfile.md); the Dockerfile and its bundled, `node_modules`-free image stay.

## Context

Dokploy built `apps/server/Dockerfile` on the production host on every push to `main`. Nothing
gated it: a commit that failed lint or tests still deployed. The build also ran beside the live
server and Postgres and competed with them for memory and CPU, and no image existed outside the
host, so a rollback depended on what Dokploy happened to keep.

## Decision

- `.github/workflows/deploy-server.yml` runs the CI jobs for the commit (`ci.yml` through
  `workflow_call`), builds the image once with Buildx and pushes it to GitHub Container Registry as
  `ghcr.io/<owner>/<repo>-server:<commit sha>` and `:latest`.
- The deploy job runs in the `production` GitHub environment, which can require an approval. It
  calls the Dokploy API: `application.saveDockerProvider` points the application at the commit's
  tag, `application.deploy` queues the deployment, and the job polls `deployment.all` until the
  deployment is done or failed.
- The Dokploy application's source is the Docker image, with autodeploy off. Dokploy never builds.
- `compose.prod.yml` runs the same image locally with Postgres, the replication bootstrap,
  PowerSync and MinIO, to check a change to the image or startup before it reaches `main`.
- PowerSync is a Dokploy Compose application from `powersync/compose.dokploy.yml`, redeployed by
  hand after a stream change has reached the server.

## Consequences

- A commit that fails checks or tests is never built or deployed.
- Every deployed version is an immutable image tagged with its commit; rolling back is deploying
  an older tag.
- The Dokploy panel must be reachable from GitHub's runners on a proxied hostname, and the
  repository holds an API key for it in the `production` environment.
- The image is private: Dokploy pulls it with a token that has only `read:packages`.
- CI runs twice for a server change on `main` (once as CI, once inside the deploy workflow). That
  is the price of `workflow_call` keeping the gate and the deploy in one run.
