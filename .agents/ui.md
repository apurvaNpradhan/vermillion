# UI

The app UI is native: HeroUI Native with Uniwind (Tailwind classes). Load `heroui-native` and `vercel-react-native-skills`. Expo web is off; a future companion or marketing site picks its own UI kit ([ADR 0033](../docs/adr/0033-mobile-first-api-host.md)).

Import `Button` and `Card` from `@/platform/ui/button` and `@/platform/ui/card`, not from `heroui-native`: they carry the Vermillion radius and hairline. Destructive buttons use `variant="danger-soft"`, never `danger`. Icons come from `phosphor-react-native`.

Text inputs are `Field` (`@/platform/ui/field`), not HeroUI's `TextField`/`Input`/`Label`; inside TanStack Form use `@/platform/forms/text-field`. A borderless input that must not look like a form field (the note sheet) may use `TextInput` directly.

### Copy-in components ([ADR 0030](../docs/adr/0030-native-component-sourcing.md))

HeroUI Native is the base. When it lacks a component, copy it from PanelUI (MIT; Uniwind) or, for Reanimated-only pieces, Reacticx (MIT) into `apps/native/src/platform/ui/`. Never add either as a dependency; no Skia. Restyle to role tokens, swap icons to Phosphor, take every string through props, put pure logic in a tested sibling file, and start the file with a comment naming the source, version, MIT licence and the changes. Port only when a screen uses it in the same change.

In `platform/ui`: `OtpInput`, `Field`, `SearchBar`, `Skeleton`/`SkeletonList`, `EmptyState`, `NumberFlow`, `StatTile`, plus `Button`, `Card`, `Page`/`ScrollPage`, `ListSection`/`ListRow`, `OptionSheet`, `ActionSheet`, `SwipeRow`, `FloatingSurface`, `FormError`, `Notice`.

## Tokens

All color, radius, type and font come from `packages/ui/src/tokens/brand.ts` (Vermillion roles mapped to HeroUI Native's names; `packages/ui` holds tokens only). Use semantic classes (`bg-background`, `text-muted`, `text-title-xl`), never raw hex. After editing the file run `pnpm --filter @workspace/ui tokens` and commit the generated CSS. The design system, its rules and the role-to-class table are in [DESIGN.md](../DESIGN.md).

Native themes ([ADR 0031](../docs/adr/0031-native-themes-colour-only-oklch.md), amended; [guide](../docs/guides/native-themes.md)): only System, Light and Dark, colour-only, one layout. Light and Dark are Classic from `tokens/brand.ts` (shared with email), emitted into Uniwind's built-in `light` and `dark` variants. Every role is defined, and `theme-rules.test.ts` enforces contrast and layer steps. After changing them run `pnpm --filter @workspace/ui tokens`, commit the generated CSS, and restart Metro. Layout never branches on the theme; use `useThemeMode()` for native chrome, not `theme === "dark"`. Use `identity` / `identity-soft` / `focus-ring` for focus, checks and selection, `on-identity` on an identity fill; `brand-detail` is decorative only.

Classic rules: no brand accent color in the UI; the primary action is the one white (dark) or near-black (light) filled button per screen; selected states use the surface step and `foreground`; numbers use tabular figures.

## Behaviour

- Forms use TanStack Form; show field errors with translated messages.
- Toasts through HeroUI Native's `useToast`.
- Interactive elements need accessible names.
