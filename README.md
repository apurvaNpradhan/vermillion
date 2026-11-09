# vermillion

A mobile-first app with personal accounts: a native app and an API server, with the full account lifecycle, abuse protection, local-first sync, background jobs, tests, CI and operations docs. There is no web app. A marketing site and a companion app come later as separate apps ([ADR 0033](docs/adr/0033-mobile-first-api-host.md)); the last commit with the old web app is tagged `pre-web-removal`.

| Part          | Stack                                                                         | Runs on                                      |
| ------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `apps/native` | Expo, Expo Router, HeroUI Native, Uniwind, PowerSync                          | iOS and Android (EAS)                        |
| `apps/server` | Hono, oRPC 2, Better Auth, Drizzle, pg-boss                                   | Dokploy at `api.<domain>`, separate Postgres |
| `packages/*`  | `@workspace/{api,auth,db,ui,env,shared,logger,i18n,email,client,sync,config}` |                                              |

Tooling: pnpm, Turborepo, TypeScript 7, oxlint and oxfmt, lefthook, commitlint, knip, zizmor, Renovate and Vitest (on Docker Postgres).

## What is included

- Passwordless sign-in with emailed codes and passkeys; account-first onboarding; Google and GitHub when configured; Turnstile CAPTCHA; disposable-email blocking; a registration switch.
- Preferences (language, time zone), a System, Light or Dark theme per device, `en` and `de`.
- Local-first sync of notes with PowerSync, an upload queue and a rejected-writes review.
- Account deletion with email confirmation.
- Postgres-backed jobs with retries, localized React Email templates, structured JSON logs.
- An example `notes` vertical (native, API, sync, tests) to replace with the product's first vertical.

## Getting started

Requires Node 24, pnpm 12 and Docker (for Postgres).

```sh
pnpm install
cp apps/server/.env.example apps/server/.env     # set BETTER_AUTH_SECRET (openssl rand -hex 32)
cp apps/native/.env.example apps/native/.env
pnpm db:start                                    # Postgres, sync bootstrap and PowerSync (docker-compose.yml)
pnpm dev                                         # server and the native bundler
```

On a Linux host whose firewall drops container-to-host traffic, PowerSync cannot fetch the API's JWKS and signed-in sync fails (`PSYNC_S2204`). Start the stack with the host-network override instead of `pnpm db:start`: `pnpm --filter server build:bootstrap && docker compose -f docker-compose.yml -f compose.linux.yml up -d --wait`.

The API listens on <http://localhost:3000>; `/api/health` answers when it is up. The native app needs a dev client, not Expo Go: see [native development](docs/guides/native-dev.md). Without a `RESEND_API_KEY` the server prints emails (sign-in codes) to its log. `pnpm dev:server` and `dev:native` start one app.

| Command                           | What it does                                       |
| --------------------------------- | -------------------------------------------------- |
| `pnpm lint` / `pnpm lint:fix`     | oxlint and oxfmt                                   |
| `pnpm typecheck`                  | TypeScript 7 across the workspace                  |
| `pnpm knip`                       | Dead code and unused dependencies                  |
| `pnpm test`                       | Unit and API tests (need `pnpm db:start`)          |
| `pnpm test:sync`                  | Real-service sync tests (stack and API running)    |
| `pnpm sync:bootstrap`             | Provision PowerSync roles, storage DB, publication |
| `pnpm test:sync-infra`            | Bootstrap and slot tests on the compose Postgres   |
| `pnpm i18n:check` / `i18n:report` | Locale consistency, key usage                      |
| `pnpm db:generate` / `db:migrate` | Create / apply a migration                         |

## Configuring the app

`app.config.ts` holds the app's name, URLs, ports, bundle ids, scheme and version. Nothing rewrites derived files for you, so when you change the identity, update these by hand: the root `package.json` name, the compose project, database and volume names in `docker-compose.yml`, the port in `apps/server/Dockerfile`, the server URLs in `apps/native/eas.json`, and the `.env.example` files. Workspace packages stay `@workspace/*` on purpose. Deployment is in [docs/deployment.md](docs/deployment.md).

## Documentation

| Read                                            | For                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| [AGENTS.md](AGENTS.md) and [.agents/](.agents/) | Conventions for coding agents and contributors                      |
| [CONTEXT.md](CONTEXT.md)                        | Glossary                                                            |
| [docs/adr/](docs/adr/)                          | Why each major decision was made                                    |
| [docs/deployment.md](docs/deployment.md)        | Dokploy, Cloudflare DNS, firewall, trusted proxies, env, EAS        |
| [docs/runbook.md](docs/runbook.md)              | Deploy, rollback, backups, restore drill, secrets, closing sign-ups |
| [DESIGN.md](DESIGN.md)                          | Brand tokens                                                        |

## Marketing site and companion app

Both are future, separate apps that call the same API (`packages/api` exports its types) and, for the companion, the same sync data. Nothing in the repo is shaped around them except keeping the server client-agnostic.

## License

No license is granted yet: set one before publishing a fork. Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
