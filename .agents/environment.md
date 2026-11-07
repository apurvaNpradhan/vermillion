# Environment variables

`packages/env` (t3-env) validates per runtime and fails at startup with a readable message.

| Entry  | Import                                                              | Holds                                                            |
| ------ | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Server | `@workspace/env/server`                                             | Secrets and server config. Importing it validates `process.env`. |
| Web    | `createWebEnv(import.meta.env)`                                     | Public `VITE_*` build-time values only.                          |
| Native | `createNativeEnv({ EXPO_PUBLIC_...: process.env.EXPO_PUBLIC_... })` | Public `EXPO_PUBLIC_*` values only.                              |

## Rules

- Read env only through these entries. No `process.env` / `import.meta.env` elsewhere.
- The web bundle runs in browsers and a Worker: nothing secret may get a `VITE_` prefix. Native bundles are readable too.
- Adding a variable: add it to the schema, the matching `.env.example`, `turbo.json` `globalEnv` (so cache keys change), the CI `env` block if checks need it, and `docs/deployment.md`.
- Optional features switch on when their variable is set (Turnstile, OAuth providers, Resend); do not add a separate boolean.
- Names, ports and URLs of the app itself come from `app.config.ts`, not env.
- Local files: copy each `.env.example` to `.env`. Git ignores `.env`.
