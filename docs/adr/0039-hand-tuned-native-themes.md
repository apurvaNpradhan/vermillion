# 0039. Hand-tuned native palettes with independent appearance

Status: accepted, 2026-11-11. Supersedes the named-theme removal, generator and neutral-only
colour grammar in [0031](0031-native-themes-colour-only-oklch.md). Its colour-only layout
rule and contrast requirements remain.

## Context

The OKLCH generator produced a generic look. We want a small collection of palettes whose
surfaces, accents and status colours are hand-tuned together. Theme names should describe
palettes without mixing OS following and light/dark choices into the same list.

## Decision

Offer Classic, Chalk, Frost, Iron and Dusk, each with light and dark RoleTokens. Keep Classic
unchanged and keep email on Classic. Each new palette has its own file so palette design can
proceed independently of runtime and UI work. Initially the new files copy Classic and mark
their identity/layer checks pending; the palette author removes pending after tuning.

Store Theme × Appearance per device at `device.theme`. Appearance is System, Light or Dark.
An old bare appearance migrates to Classic plus that appearance. Invalid values reset to
Classic × System. No account sync. Both settings are available before sign-in.

Use flat Uniwind variants, retaining `light` and `dark` for Classic. The app resolves the OS
scheme itself and forces native Appearance after Uniwind applies the palette. All themes
share one layout and the same variables.

Classic retains neutral actions. Other palettes use their accent for identity and primary
actions, including active tabs, current sets, progress, filters and active programs. The
`chart` role is Classic foreground or the other palette's accent, independent of selection
semantics. Completed sets use each palette's set-done green roles. The muscle body map stays
untinted red in every theme. Splash, icon and notification colour stay unchanged.

Chalk draws inspiration from Flexoki by Steph Ango, Frost from Nord by Arctic Ice Studio,
Iron from Gruvbox by Pavel Pertsev, and Dusk from Rosé Pine. All are MIT licensed. See
[credits](../licenses/palette-credits.md). These are hand-tuned app palettes, not generated
copies of editor themes.

## Consequences

Ten complete palettes need review. Contrast, status, plate and layer tests guard their role
contracts; only Classic has permanent neutral-identity and dark-layer exemptions. Placeholders
cannot be considered finished palette designs until their pending flags are removed.

Metro must restart with `--clear` when theme registration changes. Native appearance and
edge-to-edge bar behaviour still need a device smoke test.
