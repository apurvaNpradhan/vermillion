# 0053. The public website returns: TanStack Start on Cloudflare Workers, public pages only

Status: accepted (2026-11-21); the site's palette and type now follow [0059](0059-amoled-neutral-modes-and-accent-split.md). Amends [0033](0033-mobile-first-api-host.md) and [0046](0046-site-admin-closed-beta-and-rename.md); the old site and admin stay removed (tag `pre-web-removal`).

## Context

The app needs a public face: a landing page with the Android download, and the privacy policy, terms and account-deletion pages that Google Play and users expect. The earlier site and its admin were removed pending a rebuild ([0033](0033-mobile-first-api-host.md)). The site was TanStack Start on a Worker before ([0012](0012-web-rendering-model.md)).

## Decision

- `apps/web` is a TanStack Start app built with Vite and the Cloudflare Vite plugin, deployed with Wrangler to a Cloudflare Worker named `patina-web`.
- It has **public pages only**: `/`, `/privacy`, `/terms`, `/delete-account` and a 404. No admin, invites, sign-in, API calls, cookies or runtime environment variables. The four public pages are prerendered and served as static assets at their canonical URLs, with no trailing slash on the legal pages. The Worker renders the 404 for unmatched paths.
- The site reads its name and origin from `appConfig.displayName` and `appConfig.urls.site`. Wrangler cannot import `app.config.ts`, so `wrangler.jsonc` holds the custom domain as a route and `pnpm --filter web check:host` validates it before deploy.
- The site's English catalog and legal copy live in `apps/web/src/content/`. The site has one locale. `@workspace/i18n` serves the app, API and email. The website uses local brand tokens for the logo palette of ink, ivory and olive.
- Deploys run from `.github/workflows/deploy-web.yml` on relevant pushes to `main`, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The API stays on Dokploy ([0045](0045-build-in-ci-deploy-by-api.md)).
- The privacy policy and terms are drafts the owner must review; the legal text sits in one content module with a comment saying so.

## Consequences

- A second deploy target, but a free, static one with no secrets in the bundle.
- A companion web app or an admin, if they return, are separate decisions and probably separate apps; this one stays small and public.
- Changing what the app collects means changing `apps/web/src/content/legal.ts` in the same change.
