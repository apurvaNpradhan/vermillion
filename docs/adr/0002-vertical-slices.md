# 0002. Domain code lives in vertical slices

Status: accepted (2026-11-06). Affected by [0035](0035-remove-notes-example.md): its `notes` example slice and README are gone; the exercise vertical is the reference.

## Context

Forks must delete a feature without hunting through the repo, and the API, web and native apps each grow domain code.

## Decision

`packages/api` has a `platform/` area (database startup, HTTP middleware, the oRPC base, rate limiting, jobs, health) and one folder per domain: `procedures.ts`, one operation per file under `operations/`, colocated `tables.ts`, and a public `index.ts`. Initial verticals: account, preferences, admin, auth, notes. Web and native modules follow the same shape. A custom oxlint rule (`boundaries/vertical-boundaries`) rejects imports of another vertical except through its `index.ts`; `platform` is importable from anywhere, and tables may reference each other for foreign keys.

A package exists only when more than one app or package consumes it. That is why SEO lives in `apps/web/src/lib/seo` and not in a package.

`packages/db` holds only the connection, the migration runner, column helpers (UUIDv7 id, UTC timestamps) and Better Auth's generated tables. Migrations collect tables from every vertical.

## Consequences

- Deleting a feature is deleting one folder plus its registration lines. `notes` is the marked-for-deletion reference slice; its README lists the steps.
- The template ships an example that every fork deletes. Accepted: a worked example beats prose.
