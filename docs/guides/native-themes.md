# Native appearance

Native has two modes and six accents. In Settings → Appearance, choose the mode (System, the
default, Light or Dark) and the accent (Acid, the default, Gold, Ember, Rose, Ice or Mono).
Dark is true AMOLED black and Light is pure white; the accent is the only hue, used for the primary
action, the current and completed sets, records, the selected tab and chips and the primary chart
series. Red is the only status colour. The sign-in screen is always dark.

The decision is [ADR 0059](../adr/0059-amoled-neutral-modes-and-accent-split.md); the redesign spec is
[docs/design/redesign-2026-11/SPEC.md](../design/redesign-2026-11/SPEC.md). The earlier Sigil
beige/ember theme, its contrast variants and the theme engine no longer exist.

## Tokens

`packages/ui/src/tokens/themes/palette.ts` holds the neutrals of each mode, the six accents (a
hand-tuned fill and text value per mode and the label colour on it) and the quiet chart and set-kind tones.
`theme-variants.ts` builds every variant (`acid-light`, `ice-dark`, …); `brand.ts` exposes them as
`nativeColors`, with the built-in `light` and `dark` carrying Acid. Transactional email uses those.
The public site has its own palette.

After editing the tokens, run `pnpm --filter @workspace/ui tokens` and commit the generated CSS.
Metro registers the theme variants from `apps/native/theme-variants.js` (restart it with `--clear`
after a change); `theme-variants.test.ts` keeps that list equal to the generated names. The token
tests check every accent in both modes: neutral surfaces, layer order, AA text and mark contrast,
completed-row and pressed-state readability.

## Storage and device checks

`platform/theme/theme-state.ts` reads `{ appearance, accent }` from `device.theme`. Anything saved
by an earlier version (a theme id such as `sigil`, `classic` or `patina`, the removed contrast
setting, an unknown accent) leaves the default accent, keeping the saved appearance.

On a device, change the OS appearance with System selected, both with the app open and while it is
in the background. Switch between Light and Dark, pick each accent and restart to check that the
choices persist. Verify the status and navigation bars. Use `useThemeMode()` when native chrome or
effects need an explicit scheme.
