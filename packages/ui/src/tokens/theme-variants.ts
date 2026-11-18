import type { RoleTokens } from "./roles";
import { buildTheme } from "./themes/engine";
import { nord } from "./themes/nord";

export { cinnabar } from "./themes/cinnabar";
export { buildTheme } from "./themes/engine";

// SAFETY: the literal list defines the complete app theme union.
export const themeIds = ["nord"] as const;
/** An app theme the person can pick. */
export type ThemeId = (typeof themeIds)[number];
/** The app's default theme. */
export const DEFAULT_THEME_ID: ThemeId = "nord";

const definitions = { nord } as const;

// SAFETY: the literal list defines the complete variant-suffix union.
export const variantSuffixes = ["light", "dark", "light-contrast", "dark-contrast"] as const;
export type VariantSuffix = (typeof variantSuffixes)[number];
/** A Uniwind theme name: one theme in one scheme at one contrast level (`nord-dark-contrast`). */
export type ThemeVariant = `${ThemeId}-${VariantSuffix}`;

export function variantName(theme: ThemeId, suffix: VariantSuffix): ThemeVariant {
  return `${theme}-${suffix}`;
}

/** Every app theme variant's roles, keyed by variant name. */
// SAFETY: the entries cover every ThemeId × VariantSuffix pair exactly once.
export const themeVariants = Object.fromEntries(
  themeIds.flatMap((id) => {
    const built = buildTheme(definitions[id]);
    return variantSuffixes.map((suffix) => [variantName(id, suffix), built[suffix]]);
  }),
) as Record<ThemeVariant, RoleTokens>;

/** Every variant name, in a stable order (the Uniwind theme list). */
export const themeVariantNames = themeIds.flatMap((id) =>
  variantSuffixes.map((suffix) => variantName(id, suffix)),
);
