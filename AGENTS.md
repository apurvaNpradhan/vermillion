# AGENTS.md

Vermillion: product-neutral template for apps with personal accounts. Web (TanStack Start, Cloudflare Worker), native (Expo), API (Hono + oRPC on Dokploy), one origin. pnpm + Turborepo monorepo, TypeScript 7.

Read the guide for the area you touch before editing. Terms are defined in [CONTEXT.md](CONTEXT.md); reasons for decisions are in [docs/adr/](docs/adr/).

## Layout

- `app.config.ts`: the only place the app's name, URLs, ports, bundle ids, scheme and versions live.
- `apps/web`, `apps/native`, `apps/server`: thin apps. Domain code lives in verticals under `src/<vertical>/`.
- `packages/{api,auth,db,ui,env,shared,logger,i18n,email,client,config}`: `@workspace/*`. A package exists only if more than one app or package uses it.
- `scripts/`, `tools/`: repo tooling (i18n checks, lint plugins, secret scan, `template-init`, ops).

## Commands

| Task                                              | Command                                       |
| ------------------------------------------------- | --------------------------------------------- |
| Start Postgres + PowerSync, then everything       | `pnpm db:start` then `pnpm dev`               |
| Sync bootstrap / infra tests (need `db:start`)    | `pnpm sync:bootstrap`, `pnpm test:sync-infra` |
| Lint and format check                             | `pnpm lint` (fix: `pnpm lint:fix`)            |
| Typecheck                                         | `pnpm typecheck`                              |
| Dead code and unused deps                         | `pnpm knip`                                   |
| Unit and API tests                                | `pnpm test`                                   |
| i18n consistency / key usage                      | `pnpm i18n:check`, `pnpm i18n:report`         |
| End-to-end (needs Postgres, ports 3000/3001 free) | `pnpm test:e2e`                               |
| Generate a migration                              | `pnpm db:generate`                            |

Run lint, typecheck, knip, test and i18n:check before saying a change is done.

## Rules

- No `as` without a safety comment, no `unknown` parameters or returns, no `Record<string, unknown>`: see [typescript](.agents/typescript.md). The lint rules enforce this.
- Another vertical is reached only through its `index.ts`: see [verticals](.agents/verticals.md).
- Components never call oRPC or Query directly; use the module hook: see [data-flow](.agents/data-flow.md).
- Never read `process.env` or `import.meta.env` outside `packages/env`: see [environment](.agents/environment.md).
- Migrations are additive-only: see [database](.agents/database.md).
- Do not mock our own modules in tests; only the network boundary: see [orpc-testing](.agents/orpc-testing.md) and [testing](.agents/testing.md).
- Every user-visible string goes through i18n in `en` and `de`: see [i18n](.agents/i18n.md).
- Use brand tokens, not raw colors: see [ui](.agents/ui.md).
- Conventional commits (commitlint), body lines at most 100 characters. Never commit secrets; a pre-commit scan checks staged files.
- Workflow actions are pinned to commit SHAs; `zizmor` audits them.

## Guides

| Guide                                   | Covers                                                        |
| --------------------------------------- | ------------------------------------------------------------- |
| [typescript](.agents/typescript.md)     | Types, assertions, validation at boundaries                   |
| [verticals](.agents/verticals.md)       | Slice layout, boundaries rule, adding and deleting a vertical |
| [data-flow](.agents/data-flow.md)       | Routes, Query, module hooks, SSR vs client-only               |
| [orpc](.agents/orpc.md)                 | Procedures, builders, errors, rate limits, jobs               |
| [orpc-testing](.agents/orpc-testing.md) | Seam 1: the router in-process on PGlite                       |
| [testing](.agents/testing.md)           | Unit tests and Playwright e2e (seam 2)                        |
| [database](.agents/database.md)         | Tables, ids, timestamps, migrations                           |
| [auth](.agents/auth.md)                 | Better Auth, hardening, CAPTCHA, admin                        |
| [environment](.agents/environment.md)   | `packages/env`, public vs secret values                       |
| [i18n](.agents/i18n.md)                 | Keys, locale resolution, checks                               |
| [ui](.agents/ui.md)                     | coss ui, HeroUI Native, tokens                                |
| [deploy](.agents/deploy.md)             | Where things run; pointers to docs                            |

Vendored skills live in `.agents/skills/` (see `skills-lock.json`); load the matching skill for Better Auth, Hono, Expo, Turborepo, shadcn and coss work.
