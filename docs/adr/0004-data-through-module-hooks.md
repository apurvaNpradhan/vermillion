# 0004. Components read data only through module hooks; ids are client-generatable

Status: accepted (2026-11-06).

## Context

A local-first fork will replace oRPC queries with PowerSync or Electric. Both are options and the choice is made per fork, with known trade-offs: PowerSync syncs through its own service and SQLite on the client; Electric syncs Postgres shapes and writes through the API.

## Decision

Components never call oRPC or TanStack Query directly: each module exposes hooks (`use-notes`, `use-preferences`, ...) and components use those. On the web, app data goes through TanStack Query plus the oRPC client; Start server functions are not used for app data. Every app table uses a UUIDv7 primary key that a client can generate, plus UTC `created_at` and `updated_at`.

## Consequences

- A local-first fork rewrites the hooks, not the components.
- Rows can be created offline and synced without a schema rewrite.
- The base does not implement sync; that stays out of scope.
