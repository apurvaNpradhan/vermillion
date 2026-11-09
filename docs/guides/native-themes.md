# Native themes

The native app offers System, Light and Dark. Light and Dark are the Classic palette from
`brand.ts`, the same as web and email (Raycast-like: near-black steps, neutral identity). Named
themes, including Polar Graphite, were sunset on 2026-11-09; history in
[ADR 0031](../adr/0031-native-themes-colour-only-oklch.md).

## How it works

1. `packages/ui/src/tokens/brand.ts` holds `brandTokens.colors.light` and `.dark`, complete role
   sets shared by every platform.
2. `pnpm --filter @workspace/ui tokens` writes them into `native-tokens.css` as the values of
   Uniwind's built-in `light` and `dark` variants. No custom themes, no Metro `extraThemes`.
   Never hand-edit the generated CSS.
3. `platform/theme/theme-state.ts` parses, migrates and stores the choice (`"system" | "light" |
   "dark"`) at `device.theme`, per device. `platform/theme/index.ts` applies it before render:
   System releases the forced scheme and follows the OS through an `Appearance` listener; Light and
   Dark force the scheme so the status bar, keyboard and alerts match.
4. Settings → Preferences → Theme is a plain HeroUI `Select`.

Old stored values (the JSON selection and named themes) migrate to the nearest of the three.

## Edit a colour

Change the hex in `brand.ts` (this also changes web and email), run `pnpm --filter @workspace/ui tokens`, then
`pnpm --filter @workspace/ui test`. `theme-rules.test.ts` enforces contrast and layer steps for
Classic Light and Dark. Restart Metro after regenerating CSS.

## Validation on device

- Each of System, Light and Dark; restart and confirm persistence.
- System: change the OS appearance and watch the app follow.
- Layers (canvas, cards, sheets, tab pill) stay distinguishable at low brightness.
- Auth, CAPTCHA, keyboard, modal layers, empty and error states.
