import { brandTokens, type ColorTokenName, type ColorTokens } from "./brand";

/**
 * HeroUI Native token (the CSS variable Uniwind reads) -> brand token it takes
 * its value from. Verified against heroui-native `styles/variables.css`.
 *
 * Differences to keep in mind when editing:
 * - HeroUI `--muted` is a text color (coss `muted-foreground`), not a background.
 * - HeroUI `--*-foreground` of a status color is the text ON that color; coss
 *   status `*-foreground` is a darker text tone for tinted backgrounds, so
 *   `primary-foreground` (readable on any saturated brand color) is used.
 * - `info`, `chart-*` and `sidebar-*` have no HeroUI counterpart and stay web-only.
 */
export const nativeTokenSources = {
  background: "background",
  foreground: "foreground",
  surface: "card",
  "surface-foreground": "card-foreground",
  "surface-secondary": "secondary",
  "surface-secondary-foreground": "secondary-foreground",
  "surface-tertiary": "accent",
  "surface-tertiary-foreground": "accent-foreground",
  overlay: "popover",
  "overlay-foreground": "popover-foreground",
  muted: "muted-foreground",
  default: "control",
  "default-foreground": "secondary-foreground",
  accent: "primary",
  "accent-foreground": "primary-foreground",
  "field-background": "control",
  "field-foreground": "foreground",
  "field-placeholder": "muted-foreground",
  "field-border": "input",
  success: "success",
  "success-foreground": "primary-foreground",
  warning: "warning",
  "warning-foreground": "primary-foreground",
  danger: "destructive",
  "danger-foreground": "primary-foreground",
  segment: "control-hover",
  "segment-foreground": "foreground",
  border: "border",
  separator: "border",
  focus: "ring",
  link: "foreground",
} as const satisfies Record<string, ColorTokenName>;

const block = (variant: "light" | "dark", colors: ColorTokens) =>
  [
    `    @variant ${variant} {`,
    ...Object.entries(nativeTokenSources).map(
      ([native, source]) => `      --${native}: ${colors[source]};`,
    ),
    "    }",
  ].join("\n");

/**
 * Native mapping: the brand colors under HeroUI Native's names, overriding its
 * default light and dark themes. Import it after `heroui-native/styles`.
 */
export function toNativeCss(tokens: typeof brandTokens = brandTokens): string {
  return [
    "/* Generated from src/tokens/brand.ts by `pnpm --filter @workspace/ui tokens`. Do not edit. */",
    [
      "@layer theme {",
      "  :root {",
      `    --radius: ${tokens.radius};`,
      "    --field-border-width: 1px;",
      block("light", tokens.colors.light),
      block("dark", tokens.colors.dark),
      "  }",
      "}",
    ].join("\n"),
    "",
  ].join("\n\n");
}
