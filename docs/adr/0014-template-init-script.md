# 0014. A template-init script, not a scaffolding CLI

Status: superseded by [0033](0033-mobile-first-api-host.md) (2026-11-09). Originally accepted 2026-11-06.

## Context

Derived values (compose names, wrangler name and route, EAS URLs, database names) cannot import `app.config.ts`.

## Decision

`pnpm template:init` (`scripts/template-init.mjs`) reads `app.config.ts` and rewrites those values with structural rules. It is idempotent, supports `--dry-run`, skips files a fork deleted, and is covered by a test on a temp copy. There is no separate CLI.

## Consequences

- A new derived file is one entry in the `rules` list.
- Package names are not rewritten: they are `@workspace/*` on purpose.
