import { brandTokens, sharedTokenSources, type RoleName, type RoleTokens } from "./brand";

/**
 * HeroUI Native variable -> application role. Every custom variant defines the same set, per
 * https://heroui.com/en/docs/native/getting-started/theming.
 * HeroUI's accent is an action fill; its *-foreground is the text ON that fill.
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
  focus: "focus-ring",
  link: "text-primary",
} as const satisfies Record<string, RoleName>;

const shadows = {
  light: {
    "surface-shadow": "0 0 0 0 transparent inset",
    "field-shadow": "0 0 0 0 transparent inset",
    "overlay-shadow": "0 10px 28px 0 rgba(23, 43, 54, 0.14)",
  },
  dark: {
    "surface-shadow": "0 0 0 0 transparent inset",
    "field-shadow": "0 0 0 0 transparent inset",
    "overlay-shadow": "0 12px 32px 0 rgba(0, 0, 0, 0.32)",
  },
} as const;

function block(name: "light" | "dark", colors: RoleTokens) {
  const depth = shadows[name];
  return [
    `    @variant ${name} {`,
    ...Object.entries(nativeTokenSources).map(
      ([variable, role]) => `      --${variable}: ${colors[role]};`,
    ),
    ...Object.entries(sharedTokenSources).map(
      ([variable, role]) => `      --${variable}: ${colors[role]};`,
    ),
    ...Object.entries(depth).map(([variable, value]) => `      --${variable}: ${value};`),
    "    }",
  ].join("\n");
}

const px = (value: number) => `${value / 16}rem`;

/**
 * Build-time CSS for Uniwind's built-in `light` and `dark` variants, filled with the Classic
 * palette from brand.ts, the same as email. Imported after heroui-native/styles.
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
