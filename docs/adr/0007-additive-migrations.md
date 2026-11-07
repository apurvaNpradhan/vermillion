# 0007. Migrations are additive-only and run on start

Status: accepted (2026-11-06).

## Context

Dokploy replaces the server container on deploy, and the Worker deploys separately, so old and new code overlap briefly. Rollbacks do not undo migrations.

## Decision

The server waits for the database, applies migrations (passwords stripped from logged connection targets), then listens. A release only adds columns and tables; a later release removes what is no longer used. A migration never rewrites data in a way the previous release cannot read.

## Consequences

- The previous container and the previous Worker keep working against the new schema, so rollback is safe.
- Removing a column takes two releases.
