# Native appearance

Native ships two themes. **Sigil** (the default) is two inks and one rare ember; **Classic** is a
monochrome UI with an ink accent. Both keep status, set kinds and other training data in colour where
it carries meaning. In Preferences → Appearance, pick the theme, then Match device (the default),
Light or Dark, with optional increased contrast. The sign-in screen is always dark.

The brand spec is [docs/design/sigil/SPEC.md](../design/sigil/SPEC.md).

## Tokens

`packages/ui/src/tokens/themes/sigil.ts` and `classic.ts` define each theme's base, accent, pinned
layers and data colours. The token engine derives the remaining roles in OKLCH; a scheme's `override`
replaces a derived role with the spec's exact value (it applies at every contrast level except the
text and line ladder, which increased contrast re-derives). `theme-variants.ts` builds every variant
(`sigil-light`, `sigil-dark-contrast`, `classic-light`, …); `brand.ts` exposes them as
`nativeColors`, with the built-in `light` and `dark` carrying Sigil at standard contrast.
Transactional email uses those. The public site has its own palette.

After editing the tokens, run `pnpm --filter @workspace/ui tokens` and commit the generated CSS.
Metro registers the theme variants from `apps/native/theme-variants.js` (restart it with `--clear`
after a change); `theme-variants.test.ts` keeps that list equal to the generated names. The token
tests run the general rules (layer order, AA text pairs, selected and pressed states, increased
contrast) on every variant and the identity rules only on Classic; Sigil has its own spec checks.

## Storage and device checks

`platform/theme/theme-state.ts` reads `{ theme, appearance, contrast }` from `device.theme`. A saved
theme that no longer exists (`patina`, `oxide`, `slate`, `mulberry`, anything unknown) becomes
Sigil, keeping the saved appearance and contrast.

On a device, change the OS appearance with Match device selected, both with the app open and while
it is in the background. Switch theme, Light, Dark and Increase contrast and restart to check that
the choices persist. Verify the status and navigation bars. Use `useThemeMode()` when native chrome
or effects need an explicit scheme.
