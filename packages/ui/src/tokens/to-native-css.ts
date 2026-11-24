import {
  nativeColors,
  nativeVariantNames,
  brandTokens,
  sharedTokenSources,
  type NativeVariant,
  type RoleName,
  type RoleTokens,
} from "./brand";

/**
 * HeroUI Native variable -> application role. Every mode defines the same set, per
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
  "accent-hover": "action-hover",
  "accent-soft-foreground": "accent-soft-text",
  "field-background": "surface-control",
  "field-foreground": "text-primary",
  "field-placeholder": "text-muted",
  "field-border": "surface-control",
  // No success colour: a positive state is the accent. No warning colour: a warning is neutral
  // text with an icon. HeroUI still reads both names, so they alias the accent and the ink.
  success: "action",
  "success-foreground": "on-action",
  "success-soft-foreground": "accent-soft-text",
  warning: "text-secondary",
  "warning-foreground": "canvas",
  danger: "danger",
  "danger-foreground": "on-danger",
  "danger-soft-foreground": "danger-soft-text",
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
    "overlay-shadow": "0 10px 28px 0 rgba(0, 0, 0, 0.14)",
  },
  dark: {
    "surface-shadow": "0 0 0 0 transparent inset",
    "field-shadow": "0 0 0 0 transparent inset",
    "overlay-shadow": "0 12px 32px 0 rgba(0, 0, 0, 0.32)",
  },
} as const;

const isLightVariant = (variant: NativeVariant) =>
  variant === "light" || variant.endsWith("-light");

function block(variant: NativeVariant, colors: RoleTokens) {
  const depth = shadows[isLightVariant(variant) ? "light" : "dark"];
  return [
    `    @variant ${variant} {`,
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
 * Build-time CSS: one variant per native theme variant.
 * Imported after heroui-native/styles.
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
      ...nativeVariantNames.map((variant) => block(variant, nativeColors[variant])),
      "  }",
      "}",
    ].join("\n"),
    // HeroUI reads these variables at runtime, so keep them even without a utility using them.
    [
      "@theme inline static {",
      "  --color-accent-hover: var(--accent-hover);",
      "  --color-accent-soft-foreground: var(--accent-soft-foreground);",
      "  --color-danger-soft-foreground: var(--danger-soft-foreground);",
      "  --color-success-soft-foreground: var(--success-soft-foreground);",
      "}",
    ].join("\n"),
    [
      "@theme inline {",
      ...Object.keys(sharedTokenSources).map((name) => `  --color-${name}: var(--${name});`),
      "}",
    ].join("\n"),
    [
      "@theme {",
      ...Object.entries(tokens.fonts.native).map(([name, font]) => `  --font-${name}: "${font}";`),
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
