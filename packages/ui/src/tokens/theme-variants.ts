import type { RoleTokens } from "./roles";
import { buildTheme } from "./themes/engine";
import { graphite } from "./themes/graphite";
import { mulberry } from "./themes/mulberry";
import { patina } from "./themes/patina";
import { oxide } from "./themes/oxide";
import { slate } from "./themes/slate";

export { buildTheme } from "./themes/engine";
export { patina } from "./themes/patina";

// SAFETY: the literal list defines the complete app theme union.
export const themeIds = ["patina", "graphite", "oxide", "slate", "mulberry"] as const;
/** An app theme the person can pick. */
export type ThemeId = (typeof themeIds)[number];
/** The app's default theme. */
export const DEFAULT_THEME_ID: ThemeId = "patina";

const definitions = { patina, graphite, oxide, slate, mulberry } as const;

// SAFETY: the literal list defines the complete variant-suffix union.
export const variantSuffixes = ["light", "dark", "light-contrast", "dark-contrast"] as const;
export type VariantSuffix = (typeof variantSuffixes)[number];
/** A Uniwind theme name: one theme in one scheme at one contrast level (`patina-dark-contrast`). */
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
