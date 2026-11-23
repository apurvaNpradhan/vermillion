import type { RoleTokens } from "./roles";
import { buildTheme } from "./themes/engine";
import { sigil } from "./themes/sigil";

// SAFETY: the literal list defines the complete app theme union.
export const themeIds = ["sigil"] as const;
/** An app theme the person can pick. */
export type ThemeId = (typeof themeIds)[number];
/** The app's default theme; every retired or unknown id falls back to it. */
export const DEFAULT_THEME_ID: ThemeId = "sigil";

const roles = buildTheme(sigil);

// SAFETY: the literal list defines the complete variant-suffix union.
export const variantSuffixes = ["light", "dark", "light-contrast", "dark-contrast"] as const;
export type VariantSuffix = (typeof variantSuffixes)[number];
/** A Uniwind theme name: one theme in one scheme at one contrast level (`sigil-dark-contrast`). */
export type ThemeVariant = `${ThemeId}-${VariantSuffix}`;

export function variantName(theme: ThemeId, suffix: VariantSuffix): ThemeVariant {
  return `${theme}-${suffix}`;
}

/** Every app theme variant's roles, keyed by variant name. */
// SAFETY: the entries cover every ThemeId × VariantSuffix pair exactly once.
export const themeVariants = Object.fromEntries(
  variantSuffixes.map((suffix) => [variantName(DEFAULT_THEME_ID, suffix), roles[suffix]]),
) as Record<ThemeVariant, RoleTokens>;

/** Every variant name, in a stable order (the Uniwind theme list). */
export const themeVariantNames = variantSuffixes.map((suffix) =>
  variantName(DEFAULT_THEME_ID, suffix),
);
