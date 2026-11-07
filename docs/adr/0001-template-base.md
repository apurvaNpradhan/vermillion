# 0001. Vermillion is the template base

Status: accepted (2026-11-06).

## Context

Several apps share one stack (TanStack, Hono, oRPC, Drizzle, Better Auth, Expo) and each started from a scaffold that was not production-ready. Two references already solve most of it: morrow (the owner's production app) and tsu-stack (conventions).

## Decision

Vermillion stays the base and becomes a product-neutral GitHub template. Morrow and tsu-stack are read-only references to borrow from; tsu-stack lives git-ignored in `repos/`. Forks add the template as an `upstream` remote and merge fixes to packages and tooling; once a fork diverges, vertical slices are cherry-picked. Where borrowed code traces back to Kaneo (MIT), the notice is kept in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).

## Consequences

- Internal packages use the neutral `@workspace/*` scope so forks carry no template name.
- The app's name, URLs, ports, bundle ids, scheme and versions live in `app.config.ts`; `pnpm template:init` rewrites the values that cannot import it ([ADR 0014](0014-template-init-script.md)).
- Forks diverge deliberately: local-first (PowerSync or Electric), single-user, collaboration workspace. The seams below exist for them.
