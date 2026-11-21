# 0052. The public website returns: TanStack Start on Cloudflare Workers, public pages only

Status: accepted (2026-11-21). Amends [0033](0033-mobile-first-api-host.md) and [0046](0046-site-admin-closed-beta-and-rename.md); the old site and admin stay removed (tag `pre-web-removal`).

## Context

The app needs a public face: a landing page with the Android download, and the privacy policy, terms and account-deletion pages that Google Play and users expect. The earlier site and its admin were removed pending a rebuild ([0033](0033-mobile-first-api-host.md)). The site was TanStack Start on a Worker before ([0012](0012-web-rendering-model.md)).

## Decision

- `apps/web` is a TanStack Start app built with Vite and the Cloudflare Vite plugin, deployed with Wrangler to a Cloudflare Worker named `patina-web`.
- It has **public pages only**: `/`, `/privacy`, `/terms`, `/delete-account` and a 404. No admin, no invites, no sign-in, no API calls, no cookies and no environment variables. Every page is prerendered at build time and served as a static asset; the Worker only handles misses.
- The site's host is `appConfig.urls.site`. Wrangler cannot import `app.config.ts`, so `wrangler.jsonc` holds the custom domain as a route and `pnpm --filter web check:host` (run by the deploy workflow) fails when the two differ.
- English copy lives in `apps/web/src/content/`: `@workspace/i18n` serves the app, the API and email, and the site is English only. Brand colours are local to the site (the logo palette: ink, ivory, olive) rather than imported from `@workspace/ui`, which carries the app's theme tokens. A package is shared only when a second consumer needs it.
- Deploys run from `.github/workflows/deploy-web.yml` on pushes to `main` that touch `apps/web`, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The API stays on Dokploy ([0045](0045-build-in-ci-deploy-by-api.md)).
- The privacy policy and terms are drafts the owner must review; the legal text sits in one content module with a comment saying so.

## Consequences

- A second deploy target, but a free, static one with no secrets in the bundle.
- A companion web app or an admin, if they return, are separate decisions and probably separate apps; this one stays small and public.
- Changing what the app collects means changing `apps/web/src/content/legal.ts` in the same change.
