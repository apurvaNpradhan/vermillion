import { brandTokens, sharedTokenSources, type RoleName, type RoleTokens } from "./brand";

/**
 * HeroUI Native token (the CSS variable Uniwind reads) -> the Vermillion role it takes its value
 * from. Verified against heroui-native `styles/variables.css`.
 *
 * Differences to keep in mind when editing:
 * - HeroUI `--accent` is the primary action color (white in dark mode, near-black in light) and `--muted` is a text color; in coss / shadcn
 *   the same names are subtle backgrounds.
 * - HeroUI `--*-foreground` of a status color is the text ON that color (`on-*` roles).
 * - `--warning` takes the text tone: HeroUI derives its soft alert text from it, and light amber is
 *   unreadable as text.
 * - Fields have no visible border at rest (`field-border` = the field fill); HeroUI darkens it on
 *   focus, which gives the strong hairline.
 */
export const nativeTokenSources = {
  background: "canvas",
  foreground: "text-primary",
  surface: "surface",
  "surface-foreground": "text-primary",
  "surface-secondary": "surface-control",
  "surface-secondary-foreground": "text-primary",
  "surface-tertiary": "hairline",
  "surface-tertiary-foreground": "text-primary",
  overlay: "surface-floating",
  "overlay-foreground": "text-primary",
  backdrop: "backdrop",
  muted: "text-muted",
  default: "surface-control",
  "default-foreground": "text-primary",
  accent: "action",
  "accent-foreground": "on-action",
  "field-background": "surface-control",
  "field-foreground": "text-primary",
  "field-placeholder": "text-muted",
  "field-border": "surface-control",
  success: "success",
  "success-foreground": "on-success",
  warning: "warning-text",
  "warning-foreground": "on-warning",
  danger: "danger",
  "danger-foreground": "on-danger",
  segment: "surface",
  "segment-foreground": "text-primary",
  border: "hairline",
  separator: "hairline-strong",
  focus: "hairline-strong",
  link: "text-primary",
} as const satisfies Record<string, RoleName>;

/**
 * Depth: cards are flat in both modes (surface step + hairline); only floating layers get a light
 * mode shadow. Dark mode keeps HeroUI's inset edge on overlays.
 */
const shadows = {
  light: {
    "surface-shadow": "0 0 0 0 transparent inset",
    "field-shadow": "0 0 0 0 transparent inset",
    "overlay-shadow": "0 8px 24px 0 rgba(0, 0, 0, 0.12)",
  },
  dark: {
    "surface-shadow": "0 0 0 0 transparent inset",
    "field-shadow": "0 0 0 0 transparent inset",
    "overlay-shadow": "0 0 1px 0 rgba(255, 255, 255, 0.2) inset",
  },
} as const;

const block = (variant: "light" | "dark", colors: RoleTokens) =>
  [
    `    @variant ${variant} {`,
    ...Object.entries(nativeTokenSources).map(
      ([name, role]) => `      --${name}: ${colors[role]};`,
    ),
    ...Object.entries(sharedTokenSources).map(
      ([name, role]) => `      --${name}: ${colors[role]};`,
    ),
    ...Object.entries(shadows[variant]).map(([name, value]) => `      --${name}: ${value};`),
    "    }",
  ].join("\n");

const px = (value: number) => `${value / 16}rem`;

/**
 * Native adapter: the Vermillion roles under HeroUI Native's names, the Vermillion-only colors as
 * custom theme colors, Inter as the font, and the text scale. Import it after
 * `heroui-native/styles`. Text styles carry no weight: on native the weight picks the font file,
 * so pair `text-title-md` with `font-semibold`.
 */
export function toNativeCss(tokens: typeof brandTokens = brandTokens): string {
  return [
    "/* Generated from src/tokens/brand.ts by `pnpm --filter @workspace/ui tokens`. Do not edit. */",
    [
      "@layer theme {",
      "  :root {",
      `    --radius: ${tokens.nativeRadius};`,
      "    --field-radius: calc(var(--radius) * 1.5);",
      "    --field-border-width: 1px;",
      block("light", tokens.colors.light),
      block("dark", tokens.colors.dark),
      "  }",
      "}",
    ].join("\n"),
    [
      "@theme inline {",
      ...Object.keys(sharedTokenSources).map((name) => `  --color-${name}: var(--${name});`),
      "}",
    ].join("\n"),
    [
      "@theme {",
      ...Object.entries(tokens.fonts.native).map(
        ([weight, font]) => `  --font-${weight}: "${font}";`,
      ),
      ...Object.entries(tokens.type).flatMap(([name, style]) => [
        `  --text-${name}: ${px(style.size)};`,
        `  --text-${name}--line-height: ${px(style.lineHeight)};`,
        `  --text-${name}--letter-spacing: ${style.tracking}px;`,
      ]),
      "}",
    ].join("\n"),
    "",
  ].join("\n\n");
}
