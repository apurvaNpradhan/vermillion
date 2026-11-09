/**
 * Brand tokens: the one place colors, radius, type and fonts are defined. The values are the
 * Vermillion design system (DESIGN.md). Rebranding a fork means editing this file and running
 * `pnpm --filter @workspace/ui tokens`.
 *
 * Colors are Vermillion roles (`canvas`, `surface`, `text-muted`, `action`, ...), each with a
 * light and a dark value. Components never read a role directly; each platform maps roles to its
 * library's names through a small adapter next to this file:
 *
 * - web (`to-web-css.ts`): coss ui / shadcn names (`--primary`, `--card`, ...) via `webTokenSources`.
 * - native (`to-native-css.ts`): HeroUI Native names (`--accent`, `--surface`, ...) via
 *   `nativeTokenSources`.
 *
 * The same names mean different things in the two libraries (`accent`, `muted`); the adapters
 * resolve that, so a brand change never edits per-platform files by hand. `sharedTokenSources` are
 * colors outside both vocabularies (secondary text, macros) exposed under one name on both platforms.
 */

export const roleNames = [
  // Surfaces and lines
  "canvas",
  "surface",
  "surface-control",
  "surface-floating",
  "hairline",
  "hairline-strong",
  "backdrop",
  // Text
  "text-primary",
  "text-secondary",
  "text-muted",
  "text-disabled",
  // Identity is separate from actions, data and status. Classic remains neutral.
  "identity",
  "identity-soft",
  /** Icon and label color on an `identity` fill. */
  "on-identity",
  "brand-detail",
  "focus-ring",
  // Primary action: the brightest thing on screen, no hue.
  "action",
  "action-hover",
  "action-pressed",
  "on-action",
  // Status. `*-text` is the readable text tone; `on-*` is text placed on the status fill.
  "danger",
  "on-danger",
  "success",
  "success-text",
  "on-success",
  "warning",
  "warning-text",
  "on-warning",
  // Macros (data colors): fill for rings and bars, `*-text` for values.
  "protein",
  "protein-text",
  "carbs",
  "carbs-text",
  "fat",
  "fat-text",
] as const;

export type RoleName = (typeof roleNames)[number];
export type RoleTokens = Record<RoleName, string>;

const dark: RoleTokens = {
  canvas: "#07080A",
  surface: "#111214",
  "surface-control": "#1C1D20",
  "surface-floating": "#18191C",
  hairline: "#26282B",
  "hairline-strong": "#393B3F",
  backdrop: "rgb(0 0 0 / 60%)",
  "text-primary": "#F4F4F6",
  "text-secondary": "#CDCDCF",
  "text-muted": "#9C9C9F",
  "text-disabled": "#6A6B6E",
  identity: "#F4F4F6",
  "identity-soft": "#1C1D20",
  "on-identity": "#07080A",
  "brand-detail": "#F4F4F6",
  "focus-ring": "#393B3F",
  action: "#E6E6E6",
  "action-hover": "#FFFFFF",
  "action-pressed": "#CDCECE",
  "on-action": "#2F3031",
  danger: "#FF5C7A",
  "on-danger": "#07080A",
  success: "#59D499",
  "success-text": "#59D499",
  "on-success": "#07080A",
  warning: "#FFC533",
  "warning-text": "#FFC533",
  "on-warning": "#07080A",
  protein: "#57C1FF",
  "protein-text": "#57C1FF",
  carbs: "#FFC533",
  "carbs-text": "#FFC533",
  fat: "#D98BC4",
  "fat-text": "#D98BC4",
};

const light: RoleTokens = {
  canvas: "#F4F4F6",
  surface: "#FFFFFF",
  "surface-control": "#ECECEF",
  "surface-floating": "#FFFFFF",
  hairline: "#E2E2E6",
  "hairline-strong": "#C9C9CF",
  backdrop: "rgb(0 0 0 / 30%)",
  "text-primary": "#111214",
  "text-secondary": "#3C3D42",
  "text-muted": "#65666C",
  "text-disabled": "#A3A4AA",
  identity: "#111214",
  "identity-soft": "#ECECEF",
  "on-identity": "#FFFFFF",
  "brand-detail": "#111214",
  "focus-ring": "#C9C9CF",
  action: "#111214",
  "action-hover": "#2A2B2F",
  "action-pressed": "#000000",
  "on-action": "#FFFFFF",
  danger: "#D21F4B",
  "on-danger": "#FFFFFF",
  success: "#2FB872",
  "success-text": "#177A4B",
  "on-success": "#111214",
  warning: "#F2B21B",
  "warning-text": "#8F6200",
  "on-warning": "#FFFFFF",
  protein: "#1A86CC",
  "protein-text": "#0B6FA8",
  carbs: "#BF8500",
  "carbs-text": "#8F6200",
  fat: "#B0509B",
  "fat-text": "#94407F",
};

/**
 * Colors outside both libraries' vocabularies, exposed under the same name on web and native
 * (`text-subtle`, `bg-protein`). `subtle` is the `text-secondary` role: neither library has a free
 * name for it.
 */
export const sharedTokenSources = {
  subtle: "text-secondary",
  identity: "identity",
  "identity-soft": "identity-soft",
  "on-identity": "on-identity",
  "brand-detail": "brand-detail",
  "focus-ring": "focus-ring",
  protein: "protein",
  "protein-text": "protein-text",
  carbs: "carbs",
  "carbs-text": "carbs-text",
  fat: "fat",
  "fat-text": "fat-text",
} as const satisfies Record<string, RoleName>;

/** One text style: size and line height in px, tracking in px, weight. */
export interface TextStyle {
  size: number;
  lineHeight: number;
  tracking: number;
  weight: 400 | 500 | 600;
}

/**
 * Text scale. UI styles plus the numeric tier; numeric styles always pair with tabular figures
 * (`numeric` on web, `tabular-nums` on native).
 */
export const typeScale = {
  "title-display": { size: 42, lineHeight: 48, tracking: -1, weight: 600 },
  "title-xl": { size: 28, lineHeight: 34, tracking: -0.3, weight: 600 },
  "title-lg": { size: 22, lineHeight: 28, tracking: -0.2, weight: 600 },
  "title-md": { size: 18, lineHeight: 24, tracking: -0.1, weight: 600 },
  "body-lg": { size: 17, lineHeight: 24, tracking: 0, weight: 400 },
  body: { size: 15, lineHeight: 22, tracking: 0, weight: 400 },
  label: { size: 13, lineHeight: 18, tracking: 0.1, weight: 500 },
  caption: { size: 12, lineHeight: 16, tracking: 0.2, weight: 400 },
  overline: { size: 11, lineHeight: 14, tracking: 0.6, weight: 600 },
  "numeric-hero": { size: 72, lineHeight: 76, tracking: -1.5, weight: 600 },
  "numeric-xl": { size: 48, lineHeight: 52, tracking: -1, weight: 600 },
  "numeric-lg": { size: 32, lineHeight: 36, tracking: -0.5, weight: 600 },
  "numeric-md": { size: 20, lineHeight: 24, tracking: -0.2, weight: 500 },
  "numeric-sm": { size: 15, lineHeight: 20, tracking: 0, weight: 500 },
} as const satisfies Record<string, TextStyle>;

export const brandTokens = {
  colors: { light, dark },
  /** Web `--radius` (buttons and inputs land on 12, cards on 16; see globals.css). */
  radius: "0.75rem",
  /** HeroUI Native `--radius`; its scale multiplies it (`rounded-xl` = 12, `rounded-2xl` = 16). */
  nativeRadius: "8px",
  type: typeScale,
  fonts: {
    sans: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    /** Static Inter files loaded by the native app, by PostScript name. */
    native: {
      normal: "Inter_400Regular",
      medium: "Inter_500Medium",
      semibold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    },
  },
} as const;
