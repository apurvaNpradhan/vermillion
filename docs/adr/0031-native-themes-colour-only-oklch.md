# 0031. Native themes are colour-only and generated in OKLCH

Status: accepted (2026-11-08). Amended 2026-11-09: superseded, named themes sunset (see the note below). Supersedes the "reversible theme gallery" experiment recorded in DESIGN.md and the old guide. Amends [0028](0028-native-navigation-shell.md).

> **Amended 2026-11-09: superseded, named themes sunset.** Native now offers only System, Light and Dark. Light and Dark use the Polar Graphite values from `native-themes.ts` through Uniwind's built-in `light` and `dark` variants. The other families, the generator, `palette-sources.ts`, `oklch.ts`, the Appearance screen and `extraThemes` registration were removed. The colour-only rule, the role set and the contrast and layer tests still hold, now over Polar and Classic. The record below is kept as history.

## Context

The theme gallery was an experiment: Polar Graphite and Classic, with Classic restoring the old layout and a long list of editor palettes (Gruvbox, GitHub Dark, Catppuccin Mocha, Kanagawa Dragon, Refire, Prometheus, Lusion). Those extra themes were mapped role by role by hand from editor palettes. They had no consistent layer steps, so cards and sheets merged into the canvas, and no contrast guarantees, so muted text and status colours failed on some. Two layouts doubled the screens to verify. A single picker with 15 entries also mixed light and dark with no link to the OS appearance.

## Decision

- **Colour-only.** A theme changes colour and nothing else. One layout, the former Polar composition, serves every theme. The Classic-restores-the-old-layout behaviour is gone.
- **Seven pairs, 14 themes.** Polar Graphite (hand-tuned reference; Polar Dark was darkened, Nord-inspired), Classic (`brand.ts`, neutral identity, also used by web and email), Flexoki, Rosé Pine (Dawn/Moon), Catppuccin (Latte/Mocha), Kanagawa (Lotus/Wave), Everforest (medium). Removed: Catppuccin Mocha as a lone dark, Gruvbox, Kanagawa Dragon, GitHub Dark, Refire, Prometheus, Lusion.
- **Generated, not hand-mapped.** `theme-generator.ts` is an in-house OKLCH generator, inspired by Linear's 2024 LCH theme generator (base, accent and contrast in, every role out). It takes the official swatches in `palette-sources.ts` (hex only). Neutrals keep the source hue with capped chroma. Status and data colours keep the source hue and get lightness fitted for contrast. Every theme defines every role, with no fallback spread. `on-identity` is a new role: the icon or text on an `identity` fill.
- **Rules are tests.** `theme-rules.test.ts` runs over all 14 themes plus the two Classic ones:
  - Every role is defined.
  - `text-primary` is at least 7:1 on `canvas` and `surface`.
  - `text-secondary`, `text-muted`, `success-text`, `warning-text`, `protein-text`, `carbs-text`, `fat-text` and `danger` are at least 4.5:1 on both.
  - `on-action` on `action` and `on-identity` on `identity` are at least 4.5:1.
  - `identity`, `focus-ring` and `hairline-strong` are at least 3:1 on `canvas`, and `identity` on `identity-soft` is at least 3:1.
  - Dark layers rise `canvas` < `surface` < `surface-control` < `surface-floating` in OKLCH L, each step 0.015 to 0.06. Light: `surface` is the lightest, `canvas` and then `surface-control` are one step each below it (same range), `surface-floating` is at least `surface` and at most 0.06 above it. `surface-floating` never equals `surface-control`.
  - Classic exemptions: the identity visibility checks are skipped because Classic is neutral by design (identity is its text colour, its focus ring a quiet hairline). The layer-order check is skipped for Classic dark, whose `surface-floating` sits below `surface-control` (a darker sheet).
- **Colour grammar.** The primary action is neutral. `identity` marks focus, checks, selection and the active tab capsule (`identity-soft` fill, `identity` icon). The compose button is an `identity` fill with an `on-identity` icon.
- **Selection.** One device-local value, `device.theme`, JSON `{sync, light, dark, single}`. Default: sync on, Polar Light and Polar Dark. Old values migrate: `system` becomes sync with Classic Light/Dark; `light` and `dark` become sync off with that Classic theme; a bare theme id becomes sync off with it. Anything invalid falls back to the default. With sync on, an `Appearance` listener switches between the pair as the OS changes. With sync off, the app forces the colour scheme (`Appearance.setColorScheme`) so native chrome (status bar, keyboard, alerts) matches.
- **Appearance screen.** Settings → Preferences → Appearance, and the sliders button in the tab-bar menu header: a sync switch, then Light and Dark rows of mini-UI preview cards, or one grid when sync is off. There is no theme picker before sign-in. No custom themes and no high-contrast theme yet; the generator makes both cheap later. Native only: web and email stay Classic.
- **Licences.** The five source palettes are MIT; the notices file no longer exists..

## Consequences

- Adding a theme pair is a source entry, a generator call, the tokens script and i18n keys; the rules tests reject a palette that cannot meet contrast ([native themes guide](../guides/native-themes.md)).
- Generated values differ from the published palettes. That is intended: legibility beats fidelity.
- Layout, copy and component behaviour no longer vary by theme, so screens are verified once.
- `DEFAULT_THEME` is gone; the default is `DEFAULT_SELECTION` in `platform/theme/theme-state.ts`.

## Navigation shell changes (amends 0028)

Tab bar, pill and panel details are recorded in the amendment on [0028](0028-native-navigation-shell.md).

## Amended 2026-11-09 (later)

Polar Graphite was dropped as well: native Light and Dark now use the Classic palette from
`brand.ts`, the same as web and email, and `native-themes.ts` is gone.
