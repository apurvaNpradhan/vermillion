# UI

The app UI is native: HeroUI Native with Uniwind (Tailwind classes). Load `heroui-native` and `vercel-react-native-skills`. Expo web is off; a future companion or marketing site picks its own UI kit ([ADR 0033](../docs/adr/0033-mobile-first-api-host.md)).

Import `Button` and `Card` from `@/platform/ui/button` and `@/platform/ui/card`, not from `heroui-native`: they carry the Vermillion radius and tonal fills. Destructive buttons use `variant="danger-soft"`, never `danger`. Icons come from `phosphor-react-native`.

Text inputs are `Field` (`@/platform/ui/field`), not HeroUI's `TextField`/`Input`/`Label`; inside TanStack Form use `@/platform/forms/text-field`. A borderless input that must not look like a form field (a note field that sits on a sheet) may use `TextInput` directly.

### Copy-in components ([ADR 0030](../docs/adr/0030-native-component-sourcing.md))

HeroUI Native is the base. When it lacks a component, copy it from PanelUI (MIT; Uniwind) or, for Reanimated-only pieces, Reacticx (MIT) into `apps/native/src/platform/ui/`. Never add either as a dependency; no Skia. Restyle to role tokens, swap icons to Phosphor, take every string through props, put pure logic in a tested sibling file, and start the file with a comment naming the source, version, MIT licence and the changes. Port only when a screen uses it in the same change.

In `platform/ui`: `OtpInput`, `Field`, `SearchBar`, `Skeleton`/`SkeletonList`, `EmptyState`, `NumberFlow`, `StatTile`, `Compare` (a seam over two pictures), `ImageViewer` (full screen, zoom, swipe; generic over items, used through `MediaViewer`), plus `Button`, `Card`, `Page`/`ScrollPage`, `ListSection`/`ListRow`, `OptionSheet`, `ActionSheet`, `SwipeRow`, `FloatingSurface`, `FormError`, `Notice`.

## Tokens

All color, radius, type and font come from `packages/ui/src/tokens/brand.ts` (Vermillion roles mapped to HeroUI Native's names; `packages/ui` holds tokens only). Use semantic classes (`bg-background`, `text-muted`, `text-title-xl`), never raw hex. After editing the file run `pnpm --filter @workspace/ui tokens` and commit the generated CSS. The design system, its rules and the role-to-class table are in [DESIGN.md](../DESIGN.md).

Native appearance ([ADR 0043](../docs/adr/0043-graphite-base-and-accents.md), [guide](../docs/guides/native-themes.md)):
one Graphite base in light, dark and true black, plus an accent (Mono, Vermilion, Indigo, Orchid,
Sky). `tokens/themes/graphite.ts` holds the base, `accents.ts` the accents; `brandThemes`
combines them and `brandTokens.colors` is Mono for email. Regenerate CSS after editing either and
restart Metro with `--clear` after registration changes. Layout never branches on appearance or
accent; use `useThemeMode()` for native chrome. Identity roles drive selection, `action` drives
primary buttons, and `chart` drives chart marks; all three take the accent.

Rules: color only for the accent, data and status; one filled primary action per screen; selected states use the surface step and `foreground`; numbers use tabular figures.

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
