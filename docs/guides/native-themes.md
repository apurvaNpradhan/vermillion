# Native themes

Native ships one theme, **Nord**, in Light and Dark, each at standard or increased contrast
([ADR 0048](../adr/0048-theme-engine-and-nord.md)). Preferences and the signed-out welcome
screen share an Appearance sheet: Match device / Light / Dark, the theme cards, and an Increase
contrast switch.

## Tokens

A theme is a definition in `packages/ui/src/tokens/themes/` (see `nord.ts`): per scheme a base
(the canvas), an accent, the ink on the accent and optional pins (surface, control, ink), plus a
family of data colours. `themes/engine.ts` derives every role in OKLCH. `theme-variants.ts`
builds the four variants of every theme (`nord-light`, `nord-dark`, `nord-light-contrast`,
`nord-dark-contrast`); `brand.ts` exports them as `nativeColors`, with Uniwind's built-in
`light` and `dark` carrying Nord at standard contrast.

After changing a theme run `pnpm --filter @workspace/ui tokens`. The rule tests check layer
order, 7:1 primary text, 4.5:1 text and labels, 3:1 chart marks, surface tint, the accent/done
hue distance (60°) and that increased contrast really increases it.

## Adding a theme

1. Add `themes/<id>.ts`, list the id in `themeIds` and register the definition in
   `definitions`, both in `theme-variants.ts`. A seed that cannot reach a contrast rule makes
   the build throw.
2. Add its four variant names to `apps/native/theme-variants.js` (a test compares the lists) and
   restart Metro with `--clear`.
3. Add `theme__<id>` to the locale and the label to `THEME_LABELS` in `theme-picker.tsx`.

## Storage and device checks

`platform/theme/theme-state.ts` reads `{ theme, appearance, contrast }` from `device.theme`.
Earlier formats keep their appearance; true black and retired palette fields are dropped.

On a device, change the OS appearance with Match device selected, with the app open and after
backgrounding it. Switch Light, Dark and Increase contrast and restart to check that the choice
persists. Check status and navigation bars follow the canvas.

HeroUI Native's blur and glass defaults guess dark mode with `endsWith("dark")`, which reads
`nord-dark-contrast` as light. Pass an explicit tint from `useThemeMode()` wherever those
defaults are used.
