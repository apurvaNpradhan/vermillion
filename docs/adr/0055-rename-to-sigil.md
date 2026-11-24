# 0055. Rename to Sigil

Status: accepted, 2026-11-22. Supersedes [0052](0052-rename-to-patina.md). Earlier ADRs keep the
name they were written with. The name, identity and hosts stand. The visual brand (ink, ivory and
ember, the mason's mark imagery, the Atlas photograph and the "Earn the mark." tagline) is amended
by [the November 2026 redesign spec](../design/redesign-2026-11/SPEC.md) and [0059](0059-amoled-neutral-modes-and-accent-split.md); the tagline is now "Hit your reps.
The weight goes up."

## Context

Patina came with a tortoise mascot and an olive palette: calm, but generic, and it said nothing
about the work. The new brand is built on one idea: you carve yourself out of the stone, set by set.
A sigil is the mason's mark a stonemason cut into every block they finished. The full brand is in
[the Sigil spec](../design/sigil/SPEC.md).

## Decision

- **Name.** The app is Sigil. The tagline is "Earn the mark." (in the locale); the subtitle stays in
  `app.config.ts`.
- **Brand.** Two inks (ink and ivory) and one rare ember, a mason's mark as the logo, and a single
  photograph, Michelangelo's _'Atlas' Prisoner_, as the only imagery. The tortoise and the mascot
  are removed everywhere, and the olive palette goes with them.
- **Identity.** The `name` constant in `app.config.ts` sets the scheme to `sigil` and the bundle id
  to `io.github.apurvanpradhan.sigil` on both platforms. The existing `easProjectId` is bound to
  the Expo slug `vermillion`, so `appConfig.easSlug` preserves that project slug for EAS.
- **Hosts.** `sigil.` (site), `sigil-api.` (API) and `sigil-sync.` (PowerSync) under
  `lostsignal.cloud`. The `patina*` hosts are dropped with no aliases or redirects: only the owner
  used them. `media.` and `dev.` are unchanged.
- **Unchanged.** The repository name (`vermillion`), the `@workspace/*` scope and the GitHub
  `releases` owner and repo.
- **Store listing.** If the app is ever listed in a store, the title is "Sigil: Strength Log".

## Consequences

- The new bundle id and scheme are a different app to the OS; the native stack revision is bumped
  so no over-the-air update targets old builds.
- The rebrand keeps version `0.1.0`. Bump it before tagging the next Sigil release. Beta users
  must finish syncing in the old app, install Sigil fresh, then sign in to restore their synced
  data. Obtainium users must re-add the source with the APK filter `^sigil-.*\.apk$`. After
  publishing, verify that GitHub's `releases/latest` offers the signed Sigil APK.
  See [First Sigil release](../guides/android-release.md#first-sigil-release).
- The operator moves DNS, Dokploy domains, server env and the repository variable together
  ([Moving hosts](../deployment.md#moving-hosts)), then removes the `patina*` records.
- Email sender name, locale strings and docs say Sigil; the theme, icons and website follow the
  spec in their own changes.
