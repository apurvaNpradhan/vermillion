import { brandTokens, sharedTokenSources, type RoleName, type RoleTokens } from "./brand";

/**
 * coss ui / shadcn token -> the Vermillion role it takes its value from.
 *
 * Differences to keep in mind when editing:
 * - shadcn `accent` and `muted` are subtle backgrounds (`surface-control`); the muted text color
 *   is `muted-foreground`. In HeroUI Native the same names mean the brand color and muted text.
 * - `destructive-foreground` is the rose text itself, used on a faint rose tint.
 * - `primary-hover` and `primary-active` are the primary button's hover and pressed fills.
 * - `info` carries no color, because blue belongs to protein.
 * - Charts: 1-3 are the macros in P, C, F order, 4 the neutral trend, 5 the muted secondary series.
 */
export const webTokenSources = {
  background: "canvas",
  foreground: "text-primary",
  card: "surface",
  "card-foreground": "text-primary",
  popover: "surface-floating",
  "popover-foreground": "text-primary",
  primary: "action",
  "primary-foreground": "on-action",
  "primary-hover": "action-hover",
  "primary-active": "action-pressed",
  secondary: "surface-control",
  "secondary-foreground": "text-primary",
  muted: "surface-control",
  "muted-foreground": "text-muted",
  accent: "surface-control",
  "accent-foreground": "text-primary",
  destructive: "danger",
  "destructive-foreground": "danger",
  success: "success",
  "success-foreground": "success-text",
  warning: "warning",
  "warning-foreground": "warning-text",
  info: "surface-control",
  "info-foreground": "text-secondary",
  border: "hairline",
  input: "hairline",
  ring: "hairline-strong",
  backdrop: "backdrop",
  "chart-1": "protein",
  "chart-2": "carbs",
  "chart-3": "fat",
  "chart-4": "text-primary",
  "chart-5": "text-muted",
  sidebar: "canvas",
  "sidebar-foreground": "text-secondary",
  "sidebar-primary": "action",
  "sidebar-primary-foreground": "on-action",
  "sidebar-accent": "surface-control",
  "sidebar-accent-foreground": "text-primary",
  "sidebar-border": "hairline",
  "sidebar-ring": "hairline-strong",
} as const satisfies Record<string, RoleName>;

const webTokenNames = [...Object.keys(webTokenSources), ...Object.keys(sharedTokenSources)];

const variables = (colors: RoleTokens) => [
  ...Object.entries(webTokenSources).map(([name, role]) => `  --${name}: ${colors[role]};`),
  ...Object.entries(sharedTokenSources).map(([name, role]) => `  --${name}: ${colors[role]};`),
];

const px = (value: number) => `${value / 16}rem`;

const typeTheme = (tokens: typeof brandTokens) =>
  Object.entries(tokens.type).flatMap(([name, style]) => [
    `  --text-${name}: ${px(style.size)};`,
    `  --text-${name}--line-height: ${px(style.lineHeight)};`,
    `  --text-${name}--letter-spacing: ${style.tracking}px;`,
    `  --text-${name}--font-weight: ${style.weight};`,
  ]);

/**
 * Web adapter: every coss / shadcn token becomes `--name`, exposed to Tailwind as `--color-name`,
 * plus the Vermillion-only colors and the text scale (`text-title-xl`, `text-numeric-lg`, ...).
 */
export function toWebCss(tokens: typeof brandTokens = brandTokens): string {
  return [
    "/* Generated from src/tokens/brand.ts by `pnpm --filter @workspace/ui tokens`. Do not edit. */",
    [":root {", `  --radius: ${tokens.radius};`, ...variables(tokens.colors.light), "}"].join("\n"),
    [".dark {", ...variables(tokens.colors.dark), "}"].join("\n"),
    [
      "@theme inline {",
      ...webTokenNames.map((name) => `  --color-${name}: var(--${name});`),
      `  --font-sans: ${tokens.fonts.sans};`,
      "  --font-heading: var(--font-sans);",
      `  --font-mono: ${tokens.fonts.mono};`,
      ...typeTheme(tokens),
      "}",
    ].join("\n"),
    "",
  ].join("\n\n");
}
