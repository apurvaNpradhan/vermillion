# Native appearance

The app has one neutral base, Graphite, in light, dark and true black, and a separate accent:
Mono, Vermilion, Cobalt, Violet or Teal. Appearance chooses System, Light or Dark; true black
replaces the dark canvas with pure black. All three settings live on the device, including before
sign-in, and change colour only. Email always uses Mono. See
[ADR 0043](../adr/0043-graphite-base-and-accents.md).

## Token author workflow

`packages/ui/src/tokens/brand.ts` exports `brandThemes[accent][mode]`, `accentNames`,
`themeModes` and `variantName`. `roles.ts` defines the complete `RoleTokens` contract.

- `themes/graphite.ts` holds the base roles for `light`, `dark` and `black`.
- `themes/accents.ts` holds each accent's fill and ink for light and dark. `accentRoles` derives
  the soft, hover and pressed tones.

To add an accent: add its name and pair in `accents.ts`, its label in the Appearance sheet and
`en.json`, and its three variant names to `extraThemes` in `apps/native/metro.config.js`. Then
run `pnpm --filter @workspace/ui tokens` and `pnpm --filter @workspace/ui test`, and commit the
generated `packages/ui/src/styles/native-tokens.css` with the change. Never hand-edit it. The
rule tests need 4.5:1 for the accent on canvas and surface and for its ink on the fill.

## Runtime

`platform/theme/theme-state.ts` parses `{ accent, appearance, black }` at `device.theme`.
Earlier formats (a bare appearance, or `{ theme, appearance }`) keep their appearance and start
on Mono. Unknown values fall back to Mono × System.

The app caches the OS scheme and listens for Appearance changes. System resolves to light or
dark, falling back to light if no OS scheme is available; dark becomes black when true black is
on. Uniwind custom themes disable its built-in adaptive mode and reset native Appearance, so the
app calls `Uniwind.setTheme` first and `Appearance.setColorScheme` second. `useThemeMode()` gives
light or dark for chrome; `usePaletteMode()` also distinguishes black. `expo-system-ui` paints
the root background from the selected palette.

The CSS adapter emits all variables in every variant. Mono uses `light`, `dark` and `black`;
Metro registers every non-built-in name through `extraThemes`. After changing Metro registration,
restart Metro with `--clear`.

## Device verification

Try each accent in light, dark and true black, and restart to check persistence. With System,
change the OS appearance while active and while backgrounded. Switch from forced Light or Dark
back to System. Check keyboard, alerts, CAPTCHA, sheets, status and navigation bars, and layer
separation at low brightness. Automated tests cover storage, resolution and contrast, not native
rendering.
