# 0048. A Linear-style theme engine, with Nord as the default

Status: superseded by [0059](0059-amoled-neutral-modes-and-accent-split.md), 2026-11-24 (the theme engine, Nord and
the contrast setting are removed; see the redesign spec). Accepted 2026-11-18. Amends [0047](0047-seeded-palettes.md): seeds stay, but the inputs,
the colour space and the shipped themes change. The colour-only layout rule and device-local
storage of [0039](0039-hand-tuned-native-themes.md) remain.

## Context

The neutral placeholder palette was never meant to ship, and the owner wanted fewer, better
themes. Linear rebuilt its themes around three inputs (a base colour, an accent and a contrast
level) worked out in a perceptual colour space, generating every surface, text and control
from them. Its own light and dark themes use the same generator as custom ones. We already
derived roles from a few seeds; what was missing was a perceptual space, a contrast level, and
the theme reaching status and chart colours instead of sharing one grey-green set.

The owner liked the Nord theme from the earlier hand-tuned set (ADR 0039, "Frost").

## Decision

- **Inputs.** A theme is, per scheme: a **base** (the canvas), an **accent**, optionally the ink
  on the accent, and a short **pin** list (surface, control, ink) for values the theme wants
  exactly. Plus a **family** of data colours: success, warning, danger, macros, set kinds and
  chart series two to five. `packages/ui/src/tokens/themes/engine.ts` derives every role.
- **OKLCH.** Derived surfaces step the base's OKLCH lightness and keep its hue, so neutrals are
  tinted by the theme. Tones that must be readable move in lightness (darker on light pages,
  lighter on dark ones) and keep their hue and chroma rather than greying toward the ink.
- **Contrast** is a level, not a slider: `standard` or `increased`. Increased pulls the ink toward
  black or white, brings secondary and muted text closer to it (7:1), and strengthens lines. It
  is the person's **Increase contrast** switch.
- **Variants.** Each theme builds four Uniwind themes: `<id>-light`, `<id>-dark`,
  `<id>-light-contrast`, `<id>-dark-contrast`. Uniwind's built-in `light` and `dark` carry the
  default theme at standard contrast, for the frames before the stored choice applies.
- **How far a theme reaches:**
  1. Surfaces carry the base's hue at low chroma.
  2. The accent means "you / now": active tab, current set, today, the primary button, the active
     program, selected chips and goal progress. `chart-1` is the accent.
  3. Status and set-kind colours come from the theme's family. Completed sets use its success.
  4. Charts use `chart-1` … `chart-5` (Panel UI reads `--color-chart-*`).
  5. Plate colours never change: they are physical objects.
- **Clash rule.** The accent must sit at least 60° of OKLCH hue from the done colour, tested for
  every variant. This replaces "no green accent", which only existed to keep the two apart.
- **Nord** is the app's only theme and its default. Dark: canvas `#1F232B` (one step below Nord's
  `#2E3440`, which becomes the card), controls `#3B4252`, ink `#ECEFF4`, accent `#88C0D0` with
  `#2E3440` on it. Light: canvas `#ECEFF4`, cards `#F8FAFC`, ink `#2E3440`, accent `#5E81AC` with
  white on it. Family: Aurora (green `#A3BE8C`, yellow `#EBCB8B`, orange `#D08770`, red
  `#BF616A`, purple `#B48EAD`) and Frost.
- **True black is retired.** Pure black is not Nord; Increase contrast covers "crisper".
- **Storage.** `device.theme` stores `{ theme, appearance, contrast }`. Earlier formats keep their
  appearance; retired fields (palette, accent, black) are dropped and unknown themes become Nord.
- **Picker.** One Appearance sheet: Match device / Light / Dark, theme cards that show a theme's
  light and dark halves across a diagonal, and the Increase contrast switch.
- **Brand.** Cinnabar stays the brand for the icon, splash, email and site, built by the same
  engine with its surfaces and ink pinned to the brand values.

## Consequences

- Adding a theme is one definition file (two bases, two accents, a family), one translation and
  four names in `apps/native/theme-variants.js`; a test keeps that list equal to the generated
  one. Metro must restart with `--clear` after the list changes.
- The rule tests cover every variant with no exemptions: layer order, 7:1 primary text, 4.5:1
  text and labels, 3:1 chart marks, the clash rule and surface tint.
- Moving tones by lightness made the site's Cinnabar identity a little deeper and more saturated
  (`#B6473B` → `#CE3125` in light); it is closer to the coral seed.
- Zen Garden and an app version of Cinnabar were discussed and deferred until Nord has been
  checked on the phone.
