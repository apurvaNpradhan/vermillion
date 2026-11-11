# Native themes

The app offers Classic, Chalk, Frost, Iron and Dusk in that order. Theme changes colour only.
Appearance independently chooses System, Light or Dark. Both settings live on the device,
including before sign-in. Email always uses Classic.

## Palette author workflow

`packages/ui/src/tokens/brand.ts` exports `brandThemes`, `themeNames` and `ThemeName`.
`roles.ts` defines the complete `RoleTokens` contract. `brandTokens.colors` still points to
Classic for existing consumers.

Each palette lives in `packages/ui/src/tokens/themes/`:

- `classic.ts` holds the original light and dark roles.
- `chalk.ts`, `frost.ts`, `iron.ts`, `dusk.ts` each export complete `light` and `dark` objects
  and a `pending` flag. Their current values are explicit copies of Classic.

Replace both objects in the chosen file. Set `action` and its hover/pressed/on roles to the
primary accent button; set `identity`, its soft/on roles and `focus-ring` for selection.
Set `chart` to the accent. Tune the existing `set-done` roles for completed sets. Leave the
muscle map red. Classic keeps neutral actions and foreground chart marks.

Set that file's `pending` to `false`, remove the PLACEHOLDER comment and TODO, and run
`pnpm --filter @workspace/ui tokens`, then `pnpm --filter @workspace/ui test`. Commit the
palette and generated `packages/ui/src/styles/native-tokens.css` together. No structure or
component edit is needed. Pending skips only identity visibility and layer order. All text,
status, completed-set and plate tests still apply. Only Classic keeps permanent exemptions.

## Runtime

`platform/theme/theme-state.ts` parses `{ theme, appearance }` at `device.theme`. Previous
bare `system`, `light` and `dark` values migrate to Classic with that appearance. Unknown
values, including the retired multi-theme JSON format, fall back to Classic × System.

The app caches the OS scheme and listens for Appearance changes. System resolves to the
selected theme's light/dark variant, falling back to light if no OS scheme is available.
Explicit Light and Dark ignore OS changes. Uniwind custom themes disable its built-in
adaptive mode and reset native Appearance, so the app calls `Uniwind.setTheme` first and
`Appearance.setColorScheme` second. `useThemeMode()` reads the resolved suffix for chrome.
`expo-system-ui` paints the root background from the selected palette. Android edge-to-edge
bars show that background; status and navigation icon styles follow the resolved mode.

The CSS adapter emits all variables in all ten variants. Classic uses `light` and `dark`;
Metro registers the other eight flat names through `extraThemes`. After changing Metro
registration, restart Metro with `--clear`. Never hand-edit generated CSS.

Preferences has Theme preview cards with light and dark side by side, plus an Appearance
row. Android bar controls use `expo-navigation-bar` with contrast enforcement disabled;
the added native module requires a development-client rebuild. The welcome screen exposes the same sheets before sign-in. Tapping a palette applies
it immediately and keeps the gallery open for comparison.

## Device verification

Try every Theme × Appearance combination and restart to check persistence. With System,
change the OS appearance while active and while backgrounded. Switch from forced Light or
Dark back to System. Check keyboard, alerts, CAPTCHA, sheets, status and navigation bars,
and layer separation at low brightness. Automated tests cover storage and resolution,
not native rendering.
