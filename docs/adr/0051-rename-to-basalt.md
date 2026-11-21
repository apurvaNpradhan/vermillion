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

## Theme details

All three accents keep the graphite neutrals. On-action text and accent marks were checked
(WCAG contrast; labels need 4.5:1, accent marks 3:1):

| Theme    | Scheme | Button fill / label   | Label | Accent on canvas |
| -------- | ------ | --------------------- | ----- | ---------------- |
| Basalt   | dark   | `#2C4231` / `#CFE3D2` | 8.06  | 7.36             |
| Basalt   | light  | `#2E4A35` / `#F4F2ED` | 8.74  | 8.74             |
| Graphite | dark   | `#EFEEE9` / `#111111` | 16.25 | 17.34            |
| Graphite | light  | `#191918` / `#F4F2ED` | 15.73 | 15.73            |
| Oxide    | dark   | `#5A2E24` / `#F0D2C8` | 7.97  | 8.49             |
| Oxide    | light  | `#7A3B2E` / `#F4F2ED` | 7.53  | 7.53             |

A saved choice naming a removed theme (`olive`) falls back to the default. Basalt and Graphite
accents share the success green's hue (or have none), so a completed set is told apart by its
checkmark there, not by hue.
