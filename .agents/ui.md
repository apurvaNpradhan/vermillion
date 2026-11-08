# UI

## Web

`packages/ui` holds [coss ui](https://coss.com/ui) components (Base UI, shadcn registry model). Load the `shadcn` and `coss` skills first.

```sh
cd packages/ui && pnpm dlx shadcn@latest add @coss/dialog
```

Installed files are vendored and exempt from most anti-slop lint rules. They are restyled to DESIGN.md (flat cards, text-only `destructive`, `surface-control` fields, neutral selected states, no shadows outside floating layers); re-apply that after an update overwrites a file. Use `@phosphor-icons/react` for icons (Regular weight, Fill for selected), never Lucide.

## Native

HeroUI Native with Uniwind (Tailwind classes). Load `heroui-native` and `vercel-react-native-skills`. Expo web is off.

Import `Button` and `Card` from `@/platform/ui/button` and `@/platform/ui/card`, not from `heroui-native`: they carry the Vermillion radius and hairline. Destructive buttons use `variant="danger-soft"`, never `danger`. Icons come from `phosphor-react-native`.

## Tokens

All color, radius, type and font come from `packages/ui/src/tokens/brand.ts` (Vermillion roles mapped to each library's names). Use semantic classes (`bg-primary`, `text-muted-foreground`, `text-title-xl`), never raw hex. After editing the file run `pnpm --filter @workspace/ui tokens` and commit the generated CSS. The design system, its rules and the role-to-class table are in [DESIGN.md](../DESIGN.md).

Key rules: no brand accent color in the UI; the primary action is the one white (dark) or near-black (light) filled button per screen; selected states use the surface step and `foreground`; numbers use tabular figures.

## Behaviour

- Forms use TanStack Form; show field errors with translated messages.
- Toasts through the shared `toastManager`.
- Interactive elements need accessible names; e2e tests select by role and label.
