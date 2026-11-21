# 0051. Rename to Basalt

Status: accepted, 2026-11-21. Amends [0046](0046-site-admin-closed-beta-and-rename.md) (the
name, scheme, bundle id and hosts it chose). Earlier ADRs keep the name they were written with.

## Context

Nobody has installed a release yet, so identifiers can still change freely. "Cinnabar" sounded
like a food place, and the app is growing beyond lifting: training, cardio and, later, food.

## Decision

- **Name.** The app is Basalt: calm, solid, slow progress. Tagline "Quiet progress."; longer
  subtitle "A private log for training — and soon, food." Both live in `app.config.ts`.
- **Identity.** Scheme `basalt`, bundle id `io.github.apurvanpradhan.basalt` on both platforms,
  EAS slug `basalt` (it follows `appConfig.name`; `easProjectId` is kept).
- **Hosts.** Still one level under `lostsignal.cloud`: `basalt.` (site), `basalt-api.` (API) and
  `basalt-sync.` (PowerSync). `media.` and `dev.` are unchanged. The old `cinnabar-*` records are
  removed once the new ones are live ([Moving hosts](../deployment.md#moving-hosts)).
- **Unchanged.** The repository name (`vermillion`), the `@workspace/*` scope, and the GitHub
  `releases` owner and repo.
- **Themes.** The default theme keeps its stored id `nord` and is shown as Basalt, with a deep
  moss accent. `olive` is replaced by `graphite` (monochrome) and `oxide` is added.
- **Store listing.** Google Play already has an unrelated "Basalt: Weekly Habit Tracker", so a
  future listing should be titled "Basalt: Training Log".

## Consequences

- The new bundle id and scheme are a different app to the OS; the native stack revision is
  bumped so no over-the-air update targets old builds.
- Accounts, invite and update links built from `urls` move with the hosts; the operator must
  move DNS, Dokploy domains, server env and the repository variable together.
