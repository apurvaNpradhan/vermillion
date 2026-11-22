# Native appearance

**Classic** is the only native palette. The UI uses neutral surfaces and an ink accent; status,
set kinds and other training data still use colour where it carries meaning. In Preferences →
Appearance, choose Match device (the default), Light, or Dark, with optional increased contrast.
The welcome screen follows the same appearance as the rest of the app.

## Tokens

`packages/ui/src/tokens/themes/graphite.ts` defines Classic's base, accents and data colours.
The token engine derives semantic roles in OKLCH. `brand.ts` exposes them to native as
`light`, `dark`, `contrast-light` and `contrast-dark`; transactional email uses the standard
light and dark tokens. The public site has its own fixed monochrome palette.

After editing the tokens, run `pnpm --filter @workspace/ui tokens` and commit the generated CSS.
Metro registers the two contrast variants in `apps/native/metro.config.js`. The token tests check
layer order, text and chart contrast, and stronger text and lines in increased contrast.

## Storage and device checks

`platform/theme/theme-state.ts` reads `{ appearance, contrast }` from `device.theme`. A saved
palette ID is ignored; the person's Light/Dark and contrast preferences are preserved.

On a device, change the OS appearance with Match device selected, both with the app open and
while it is in the background. Switch Light, Dark and Increase contrast and restart to check that
the choices persist. Verify the status and navigation bars, and check that signed-out screens use
the same appearance. Use `useThemeMode()` when native chrome or effects need an explicit scheme.
