# UI

The app UI is native: HeroUI Native with Uniwind (Tailwind classes). Load `heroui-native` and `vercel-react-native-skills`. Expo web is off; a future companion or marketing site picks its own UI kit ([ADR 0033](../docs/adr/0033-mobile-first-api-host.md)).

Import `Button` and `Card` from `@/platform/ui/button` and `@/platform/ui/card`, not from `heroui-native`: they carry the Vermillion radius and tonal fills. Destructive buttons use `variant="danger-soft"`, never `danger`. Icons come from `phosphor-react-native`.

Text inputs are `Field` (`@/platform/ui/field`), not HeroUI's `TextField`/`Input`/`Label`; inside TanStack Form use `@/platform/forms/text-field`. A borderless input that must not look like a form field (a note field that sits on a sheet) may use `TextInput` directly.

### Copy-in components ([ADR 0030](../docs/adr/0030-native-component-sourcing.md))

HeroUI Native is the base. When it lacks a component, copy it from PanelUI (MIT; Uniwind) or, for Reanimated-only pieces, Reacticx (MIT) into `apps/native/src/platform/ui/`. Never add either as a dependency; no Skia. Restyle to role tokens, swap icons to Phosphor, take every string through props, put pure logic in a tested sibling file, and start the file with a comment naming the source, version, MIT licence and the changes. Port only when a screen uses it in the same change.

In `platform/ui`: `OtpInput`, `Field`, `SearchBar`, `Skeleton`/`SkeletonList`, `EmptyState` (`drawing` swaps its icon for the `ConstructionDrawing`, `label` adds the mono count), `ConstructionDrawing` (the hairline circle, golden rectangle and spiral in `muted`, never animated), `SigilMark` (mark A, or A2 with `emberColor`, the accent dot), `NumberFlow`, `StatTile`, `WeekStrip` and `HeatmapChart` (PanelUI ports; geometry and bucketing in `*-math.ts`), `SwipeWeekStrip` (the month label and swipe of Home and History), `PeriodCard`, `PinnedAction` (a primary button above the tab bar), `Compare` (a seam over two pictures), `ImageViewer` (full screen, zoom, swipe; generic over items, used through `MediaViewer`), plus `Button`, `Card`, `Page`/`ScrollPage`, `ListSection`/`ListRow`, `OptionSheet`, `ActionSheet`, `SwipeRow`, `FloatingSurface`, `FormError`, `Notice`.

## Tokens

All color, radius, type and font come from `packages/ui/src/tokens/brand.ts` (Vermillion roles mapped to HeroUI Native's names; `packages/ui` holds tokens only). Use semantic classes (`bg-background`, `text-muted`, `text-title-xl`), never raw hex. After editing the file run `pnpm --filter @workspace/ui tokens` and commit the generated CSS. The design system, its rules and the role-to-class table are in [DESIGN.md](../DESIGN.md).

Native has two modes (System, Light, Dark) and six accents (Acid, Gold, Ember, Rose, Ice, Mono).
`packages/ui/src/tokens/brand.ts` exports `nativeColors` for the app (variants such as `ice-dark`;
the built-in `light` and `dark` are Acid) and standard light/dark `brandTokens.colors` for email.
The public site has its own palette. Regenerate CSS after editing the native tokens. Layout never
branches on appearance. Use `useThemeMode()` for native chrome. See the
[native themes guide](../docs/guides/native-themes.md) and the
[redesign spec](../docs/design/redesign-2026-11/SPEC.md).

Rules: the accent (`bg-accent`, `text-accent`, `text-accent-foreground`, `useActionColor()`) marks
the primary action, the current and completed sets, records and PRs, the selected tab and chips,
and the primary chart series, and nothing else; never a large surface. Red (`danger`) is the only
status colour, for destructive actions and errors, with an icon and words. There is no success,
warning, ember (`identity`), `brand-detail` or `set-done` role: a positive state is the accent and a
warning is neutral text with an icon. Charts take the accent for the primary series (`chart`,
`chart-1`) and quiet tones for the rest (`chart-2` … `chart-5`). One filled primary action per
screen; numbers use tabular figures. Geist sets native titles and body text, Geist Mono labels and
code. Geist is the only family, on the website too. Run `pnpm brand:assets` after changing the
mark. Icons: Phosphor, Regular or Fill (selected), 20 or 24, never text glyphs.
Confirmations use `ConfirmationDialog`, never `Alert.alert`.

Native groups use spacing, rounded corners and canvas/surface/default fills, with no row dividers or card outlines. Keep outlines only for fields and selected chips, swatches or option tiles; preserve diagram strokes and progress tracks. When removing a line, review row padding and group gaps, and keep a visible pressed state.

## Behaviour

- Forms use TanStack Form; show field errors with translated messages.
- Toasts through HeroUI Native's `useToast`.
- Interactive elements need accessible names.

## Bottom sheets

A bottom sheet that fails to open shows no error: the screen simply does not change, and a transparent overlay may swallow touches. Found on a device in November 2026; the checks and the simulator do not catch it.

- A sheet presents when `isOpen` **changes**. One that mounts already open (`{open ? <Sheet isOpen /> : null}`) never appears. Mount it and open it a moment later with `useSheetPresent()` (`platform/ui/use-sheet-present.tsx`): pass `isOpen={sheet.isOpen}` and render `{sheet.probe}` first in `BottomSheet.Content`. Or keep the sheet mounted and toggle `isOpen`, as the shared `ActionSheet` and `OptionSheet` do.
- Never mount two sheets in the same render, and never put one inside another's content. The second one, or the parent, stays off-screen or closes. Mount the second after the first has opened (`{sheet.isOpen ? <Other/> : null}`).
- Never swap one sheet for another (a loading sheet, then the real one). Render nothing while loading.
- No `ScrollView` inside a sheet, and no content taller than the sheet: use a short list, a window of rows, or steppers. Dynamic sizing cannot measure it.
- Check a new sheet by opening it on a device, with a screenshot (`adb exec-out screencap -p`), not an accessibility dump: the dump omits a sheet that is on screen.
