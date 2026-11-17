# Web (the site)

`apps/web` is Cinnabar's site at `cinnabar.<domain>`: public pages and the owner's admin. It is TanStack Start built to static files plus a small Cloudflare Worker ([ADR 0046](../docs/adr/0046-site-admin-closed-beta-and-rename.md)). There is no user-facing web app.

## Shape

- **Public pages** (`/`, `/privacy`, `/terms`, `/delete-account`, `/support`, `/download`) are prerendered at build time (`PUBLIC_PAGES` in `vite.config.ts`). No cookies, no analytics; Turnstile loads only on the request-access form and on the admin sign-in (the server requires it before sending a code).
- **Client-only routes** (`/admin/*`, `/invite`) set `ssr: false`; the build writes one SPA shell (`/_shell`) and the Worker serves it for those paths.
- **The Worker** (`worker/index.ts`, decisions in `worker/forward.ts`, unit tested) forwards `/rpc/*` and `/api/*` to `API_ORIGIN` (method, body and cookies kept; `X-Forwarded-For` rebuilt from `CF-Connecting-IP`, never from the client), redirects `/download` to the newest APK from `release.status` (falling through to the prerendered page when there is none), and serves the shell. Everything else is a static asset. In development Vite proxies `/rpc` and `/api` to the server, so the browser always talks to one origin and cookies stay host-only.
- **Verticals** mirror the API: `marketing`, `auth` (admin sign-in, enrolment, the gate), `admin` (shell, tables, overview, audit), `catalog`, `users`, `access`, `releases`, plus `platform`. Components never call oRPC or Query; each vertical's `use-*.ts` holds that wiring.
- **The admin gate** (`auth/admin-gate.ts`, tested) turns the session and `admin.enrolment.status` into sign-in, not-found, enrol, verify or ready. Lists keep search, filters, page and the open sheet in the URL (`validateSearch` with zod).

## UI

Tailwind v4. Components are copied from the coss ui registry into `src/platform/ui/` (the site is their only consumer; lint relaxes a few anti-slop rules there, knip ignores them). Their shadcn names (`--primary`, `--muted`, ...) map to the brand roles in `src/styles/app.css`; colours come only from `@workspace/ui/web-tokens.css` (`pnpm --filter @workspace/ui tokens`). Light and dark follow the system. Tables use TanStack Table v9 (`columnsFor<Row>().columns([...])`); forms use TanStack Form with the shared zod schemas.

## Strings

Everything visible goes through `useT()` / `t()` from `src/platform/i18n.ts`, which reads the `web` namespace (`packages/i18n/src/locales/web/en.json`) and falls back to the shared one (errors, auth). The web namespace is a separate file so the native app's key union is unaffected. Legal copy is a draft for the owner to review.

## Environment

Public build values only, through `@workspace/env/web` (`VITE_TURNSTILE_SITE_KEY`). The Worker's `API_ORIGIN` is a wrangler var validated by `workerVarsSchema`. The site's own URL comes from `app.config.ts`; in the browser the origin it was loaded from.

## Commands

`pnpm --filter web dev` (port from `app.config.ts`), `pnpm --filter web build` (CI runs it; a failed prerender fails the pipeline), `pnpm --filter web preview` (wrangler dev against the build). Deploys go through `.github/workflows/deploy-web.yml` only.
