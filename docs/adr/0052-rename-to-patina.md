# 0052. Rename to Patina

Status: accepted, 2026-11-21. Supersedes [0051](0051-rename-to-basalt.md). Earlier ADRs keep the
name they were written with.

## Context

Basalt was chosen a day before the first beta build, and nobody has installed a release yet, so
identifiers can still change freely. The new logo is a tortoise with an olive dot, ivory on ink:
slow, durable progress, and the surface that builds up on metal and wood with use. That is Patina.
Basalt also clashes with a Google Play title (ADR 0051).

## Decision

- **Name.** The app is Patina. The tagline "Quiet progress." lives in the locale, and the
  subtitle lives in `app.config.ts`.
- **Identity.** Scheme `patina`, bundle id `io.github.apurvanpradhan.patina` on both platforms and
  EAS slug `patina`. All are derived from one `name` constant in `app.config.ts`; `easProjectId`
  is kept.
- **Hosts.** Still one level under `lostsignal.cloud`: `patina.` (site), `patina-api.` (API) and
  `patina-sync.` (PowerSync), derived from the same constant. `media.` and `dev.` are unchanged.
  The old `basalt-*` records are removed once the new ones are live
  ([Moving hosts](../deployment.md#moving-hosts)).
- **Unchanged.** The repository name (`vermillion`), the `@workspace/*` scope and the GitHub
  `releases` owner and repo.
- **Store listing.** If the app is ever listed in a store, the title is "Patina: Training Log".
- **Theme.** The default theme is now Patina (id `patina`, from the logo's ink, ivory and olive).
  Graphite keeps its id and is labelled Classic. See [native themes](../guides/native-themes.md).

## Consequences

- The new bundle id and scheme are a different app to the OS; the native stack revision is bumped
  so no over-the-air update targets old builds.
- Accounts, invite and update links built from `urls` move with the hosts. The operator moves DNS,
  Dokploy domains, server env and the repository variable together.
