# vermillion

A production-ready starting point for apps with personal accounts: a web app, a native app and an API server on one origin, with the full account lifecycle, abuse protection, background jobs, tests, CI and operations docs. Create new apps from it with GitHub's "Use this template", then pull later fixes through an `upstream` remote.

| Part          | Stack                                                                    | Runs on                           |
| ------------- | ------------------------------------------------------------------------ | --------------------------------- |
| `apps/web`    | TanStack Start, coss ui (Base UI), Tailwind 4                            | Cloudflare Worker                 |
| `apps/native` | Expo, Expo Router, HeroUI Native, Uniwind                                | iOS and Android (EAS)             |
| `apps/server` | Hono, oRPC 2, Better Auth, Drizzle, pg-boss                              | Dokploy, with a separate Postgres |
| `packages/*`  | `@workspace/{api,auth,db,ui,env,shared,logger,i18n,email,client,config}` |                                   |

Tooling: pnpm, Turborepo, TypeScript 7, oxlint and oxfmt, lefthook, commitlint, knip, zizmor, Renovate, Vitest (with PGlite) and Playwright.

## What is included

- Email and password with verification and reset; Google and GitHub when configured; Turnstile CAPTCHA; disposable-email blocking; a registration switch; admin allowlist and a minimal admin page.
- Preferences (language, time zone, UI), light/dark/system theme per device, `en` and `de`.
- Account deletion on web and native, with email confirmation.
- Postgres-backed jobs with retries, localized React Email templates, structured JSON logs.
- An example `notes` vertical (web, native, API, tests) that every fork deletes.

## Getting started

Requires Node 24, pnpm 12 and Docker (for Postgres).

```sh
pnpm install
cp apps/server/.env.example apps/server/.env     # set BETTER_AUTH_SECRET (openssl rand -hex 32)
cp apps/web/.env.example apps/web/.env
cp apps/native/.env.example apps/native/.env
pnpm db:start                                    # Postgres from docker-compose.yml
pnpm dev                                         # server, web and the native bundler
```

Open <http://localhost:3001>. The Vite dev server proxies `/api` and `/rpc` to the server on port 3000, like the Cloudflare routes do in production. Without a `RESEND_API_KEY` the server prints emails (verification links) to its log. `pnpm dev:web`, `dev:server` and `dev:native` start one app.

| Command                           | What it does                                       |
| --------------------------------- | -------------------------------------------------- |
| `pnpm lint` / `pnpm lint:fix`     | oxlint and oxfmt                                   |
| `pnpm typecheck`                  | TypeScript 7 across the workspace                  |
| `pnpm knip`                       | Dead code and unused dependencies                  |
| `pnpm test`                       | Unit and API tests (PGlite, no Docker)             |
| `pnpm test:e2e`                   | Playwright against the real stack (needs Postgres) |
| `pnpm i18n:check` / `i18n:report` | Locale consistency, key usage                      |
| `pnpm db:generate` / `db:migrate` | Create / apply a migration                         |

## Starting a new app

1. Create a repository from this template and clone it.
2. Edit `app.config.ts`: `name` (lowercase slug), `displayName`, `description`, `productionUrl`, `cloudflareZone` (your DNS zone, including suffixes such as `example.co.uk`), `scheme`, `bundleIds`, ports.
3. Run `pnpm template:init --dry-run` to see what changes, then `pnpm template:init`.
4. Replace the brand ([DESIGN.md](DESIGN.md)), delete `notes` if you do not want the example ([packages/api/src/notes/README.md](packages/api/src/notes/README.md)) and set up deployment ([docs/deployment.md](docs/deployment.md)).
5. Optional: `git remote add upstream <template url>` and merge from it for fixes to shared packages and tooling.

`template:init` rewrites the values that cannot import `app.config.ts`: the root package name, the compose project, database and volume names, the development env-example URLs, the e2e database name and CI Postgres mapping, the server Dockerfile port, the wrangler Worker name and route, the EAS development and production server URLs and the README title. It is idempotent and skips files you deleted. Workspace packages stay `@workspace/*` on purpose.

## Documentation

| Read                                            | For                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| [AGENTS.md](AGENTS.md) and [.agents/](.agents/) | Conventions for coding agents and contributors                      |
| [CONTEXT.md](CONTEXT.md)                        | Glossary                                                            |
| [docs/adr/](docs/adr/)                          | Why each major decision was made                                    |
| [docs/deployment.md](docs/deployment.md)        | Dokploy, Cloudflare, path routes, firewall, trusted proxies, env    |
| [docs/runbook.md](docs/runbook.md)              | Deploy, rollback, backups, restore drill, secrets, closing sign-ups |
| [DESIGN.md](DESIGN.md)                          | Brand tokens                                                        |

## Local-first forks

The base is online-first, but it keeps the seams a local-first fork needs: components read data only through module hooks, and every table has a client-generatable UUIDv7 id with created and updated timestamps. Two sync engines fit: PowerSync (a sync service plus SQLite on the client, writes uploaded through your API) and Electric (Postgres shapes synced to the client, writes through your API). Choose per fork; morrow uses Electric.

## License

No license is granted yet: set one before publishing a fork. Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
