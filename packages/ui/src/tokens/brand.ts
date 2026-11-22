import type { RoleName, RoleTokens } from "./roles";
import { buildTheme } from "./themes/engine";
import { graphite } from "./themes/graphite";
export { roleNames, type RoleName, type RoleTokens } from "./roles";

const {
  light,
  dark,
  "light-contrast": contrastLight,
  "dark-contrast": contrastDark,
} = buildTheme(graphite);

/** Classic uses the built-in light and dark themes plus two accessibility variants. */
export const nativeColors = {
  light,
  dark,
  "contrast-light": contrastLight,
  "contrast-dark": contrastDark,
} satisfies Record<string, RoleTokens>;

export type NativeVariant = keyof typeof nativeColors;
export const nativeVariantNames: readonly NativeVariant[] = [
  "light",
  "dark",
  "contrast-light",
  "contrast-dark",
];

/**
 * Brand tokens: the one place colors, radius, type and fonts are defined. The colours come from
 * the theme engine in `themes/`. After changing them run
 * `pnpm --filter @workspace/ui tokens`.
 *
 * Colors are Vermillion roles (`canvas`, `surface`, `text-muted`, `action`, ...), each with a
 * light and a dark value. Components never read a role directly; the native adapter
 * (`to-native-css.ts`) maps roles to HeroUI Native names (`--accent`, `--surface`, ...) via
 * `nativeTokenSources`, and the email templates read the roles directly. A brand change never
 * edits per-platform files by hand. `sharedTokenSources` are colors outside HeroUI's vocabulary
 * (secondary text, macros) exposed under one name.
 */

/**
 * Colors outside HeroUI Native's vocabulary (`text-subtle`, `bg-protein`). `subtle` is the
 * `text-secondary` role: the library has no free name for it.
 */
export const sharedTokenSources = {
  chart: "chart",
  "chart-1": "chart-1",
  "chart-2": "chart-2",
  "chart-3": "chart-3",
  "chart-4": "chart-4",
  "chart-5": "chart-5",
  "set-warmup": "set-warmup",
  "set-drop": "set-drop",
  "set-failure": "set-failure",
  "set-top": "set-top",
  "set-backoff": "set-backoff",
  "set-myo": "set-myo",
  "set-done": "set-done",
  "on-set-done": "on-set-done",
  "set-done-soft": "set-done-soft",
  "set-done-soft-foreground": "set-done-soft-foreground",
  subtle: "text-secondary",
  identity: "identity",
  "identity-soft": "identity-soft",
  "on-identity": "on-identity",
  "brand-detail": "brand-detail",
  "focus-ring": "focus-ring",
  "plate-red": "plate-red",
  "plate-blue": "plate-blue",
  "plate-yellow": "plate-yellow",
  "plate-green": "plate-green",
  "plate-white": "plate-white",
  "plate-black": "plate-black",
  "on-plate-dark": "on-plate-dark",
  "on-plate-light": "on-plate-light",
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
 * (`tabular-nums`).
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
  /** HeroUI Native `--radius`; its scale multiplies it (`rounded-xl` = 12, `rounded-2xl` = 16). */
  nativeRadius: "8px",
  type: typeScale,
  fonts: {
    sans: '"Geist", ui-sans-serif, system-ui, sans-serif',
    mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    /** Static faces registered by Expo under these keys. */
    native: {
      normal: "Geist_400Regular",
      medium: "Geist_500Medium",
      semibold: "Geist_600SemiBold",
      bold: "Geist_700Bold",
      mono: "GeistMono_400Regular",
      "mono-medium": "GeistMono_500Medium",
    },
  },
} as const;
