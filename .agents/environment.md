# Environment variables

`packages/env` (t3-env) validates per runtime and fails at startup with a readable message.

| Entry          | Import                                                              | Holds                                                                                                                                     |
| -------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Server         | `@workspace/env/server`                                             | Secrets and server config. Importing it validates `process.env`.                                                                          |
| Sync bootstrap | `@workspace/env/sync-bootstrap`                                     | Admin URL and PowerSync passwords for `pnpm sync:bootstrap` / `sync-bootstrap.mjs`. Separate from Server so the job needs no auth secret. |
| Native         | `createNativeEnv({ EXPO_PUBLIC_...: process.env.EXPO_PUBLIC_... })` | Public `EXPO_PUBLIC_*` values only.                                                                                                       |

## Rules

- Read env only through these entries. No `process.env` / `import.meta.env` elsewhere.
- Native bundles are readable by anyone with the app: nothing secret may get an `EXPO_PUBLIC_` prefix.
- Adding a variable: add it to the schema, the matching `.env.example`, `turbo.json` `globalEnv` (so cache keys change), the CI `env` block if checks need it, and `docs/deployment.md`.
- Server-side entries share `packages/env/src/shared.ts` (placeholder-secret check, exit-on-invalid). Tests may read `process.env` for test-only overrides (for example `SYNC_INFRA_TEST_ADMIN_URL`); app code may not.
- Optional features switch on when their variable is set (Turnstile, OAuth providers, Resend); do not add a separate boolean.
- Names, ports and URLs of the app itself come from `app.config.ts`, not env.
- Local files: copy each `.env.example` to `.env`. Git ignores `.env`.
