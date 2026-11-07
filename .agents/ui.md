# UI

## Web

`packages/ui` holds [coss ui](https://coss.com/ui) components (Base UI, shadcn registry model). Load the `shadcn` and `coss` skills first.

```sh
cd packages/ui && pnpm dlx shadcn@latest add @coss/dialog
```

Installed files are vendored and exempt from most anti-slop lint rules; an update overwrites them, so keep local changes small and in the consuming app. Use `lucide-react` for icons.

## Native

HeroUI Native with Uniwind (Tailwind classes). Load `heroui-native` and `vercel-react-native-skills`. Expo web is off.

## Tokens

All color, radius and font come from `packages/ui/src/tokens/brand.ts`. Use semantic classes (`bg-primary`, `text-muted-foreground`), never raw hex. After editing the file run `pnpm --filter @workspace/ui tokens` and commit the generated CSS. The token table is in [DESIGN.md](../DESIGN.md).

## Behaviour

- Forms use TanStack Form; show field errors with translated messages.
- Toasts through the shared `toastManager`.
- Interactive elements need accessible names; e2e tests select by role and label.
