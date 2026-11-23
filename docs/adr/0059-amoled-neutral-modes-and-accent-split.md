# 0059. AMOLED neutral modes, a fill/text accent split and no status colours but red

Status: accepted, 2026-11-24. Supersedes [0048](0048-theme-engine-and-nord.md) and, with it, the
palette decisions of [0043](0043-graphite-base-and-accents.md) and
[0047](0047-seeded-palettes.md). Amends [0055](0055-rename-to-sigil.md) (the visual brand) and
[0051](0051-geist-typeface.md). The colour-only layout rule, device-local storage and AA contrast
requirements of [0039](0039-hand-tuned-native-themes.md) remain. Spec:
[docs/design/redesign-2026-11/SPEC.md](../design/redesign-2026-11/SPEC.md).

## Context

The Sigil theme (ink, ivory and a rare ember, with contrast variants and a theme engine) carried
many roles for few uses: `identity`, `brand-detail`, `set-done` (lichen), success and warning
colours, and per-theme data families. Screens used colour for status in several places at once, and
the brand leaned on a statue, EB Garamond and "Earn the mark.". The owner approved a redesign on
2026-11-23 that replaces all of it.

## Decision

- **Neutral modes.** Dark is true AMOLED: background `#000000`, near-black raised surfaces,
  hairline borders, untinted greys, white ink. Light is pure white with near-black ink. The setting
  is System, Light or Dark, with System the default. There is no contrast setting and no theme
  engine; saved theme ids that no longer exist fall back to the default accent and keep the saved
  appearance.
- **One accent, split into fill and text.** The accent is the only hue. Each accent has a
  hand-tuned value per mode for fills (`action`, with its on-colour for the label) and a separate
  one for text and marks (`accent`), so contrast passes in both modes. It marks the primary action,
  the current and completed sets, records, the selected tab and chips, and the primary chart series;
  never a large surface.
- **The accents** are Acid (the default), Gold, Ember, Rose, Ice and Mono (white on dark, black on
  light), picked in Settings → Appearance.
- **No success or warning colour.** Red (`danger`) is used only for destructive actions and errors,
  with an icon and words. A positive state is the accent; a warning (a stall, a lighter week) is
  neutral text with an icon. The `identity` (ember), `brand-detail` and `set-done` (lichen) roles
  and the contrast variants are removed, and their uses map to the accent or a neutral.
- **Type and brand.** Geist and Geist Mono everywhere (tabular figures for numbers); EB Garamond is
  removed. The statue, "Nonfinito" and "Earn the mark." are retired. The tagline is "Hit your reps.
  The weight goes up." The cue sounds are generated marimba (`tools/sounds`), replacing the uisfx
  files.
- **Pipeline.** Tokens stay in `packages/ui/src/tokens` and are generated with
  `pnpm --filter @workspace/ui tokens`.

## Consequences

- Earlier theme ADRs and guides are history; the [native themes guide](../guides/native-themes.md)
  and [DESIGN.md](../../DESIGN.md) describe the current state.
- A screen can no longer say "good" or "warning" with colour alone; copy and icons carry it.
- Adding an accent means tuning its fill and text values for both modes and passing the token
  contrast tests.
- Share cards, email and the public site take their colours from the same palette.
