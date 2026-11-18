# Native appearance

Native uses a temporary neutral palette in Light, Dark, and True black. Preferences and the
signed-out welcome screen share an Appearance sheet with Match device, Light, Dark, and a True
black switch. True black uses a pure black canvas when the active mode is dark.

## Tokens

`packages/ui/src/tokens/brand.ts` exports `nativeColors[mode]`. The seed values live in
`themes/palettes.ts`. Canvas, surface, ink, accent, and ink on the accent are defined for light
and dark. The remaining roles are derived from the seeds, including the true-black surface.
Workout status, macro, and plate roles keep their meanings across modes.

After changing seeds, run `pnpm --filter @workspace/ui tokens`. The role tests check layer order,
7:1 contrast for primary text, and 4.5:1 for normal text and action labels. Restart Metro with
`--clear` after changing its registered variants.

## Storage and device checks

`platform/theme/theme-state.ts` reads `{ appearance, black }` from `device.theme`. Earlier
formats keep those settings and discard old palette, accent, and theme fields.

On a device, change the OS appearance with Match device selected. Try it with the app open
and after backgrounding it. Switch between Light, Dark, and True black and restart to check
that the choice persists.
