import type { RoleTokens } from "./roles";
import {
  DEFAULT_ACCENT_ID,
  accentIds,
  deriveRoles,
  schemes,
  type AccentId,
  type Scheme,
} from "./themes/palette";

export { DEFAULT_ACCENT_ID, accentIds, schemes, type AccentId, type Scheme };

/** A Uniwind theme name: one accent in one mode (`ember-dark`). */
export type ThemeVariant = `${AccentId}-${Scheme}`;

export function variantName(accent: AccentId, scheme: Scheme): ThemeVariant {
  return `${accent}-${scheme}`;
}

/** Every variant name, in a stable order (the Uniwind theme list). */
export const themeVariantNames: readonly ThemeVariant[] = accentIds.flatMap((accent) =>
  schemes.map((scheme) => variantName(accent, scheme)),
);

/** Every app theme variant's roles, keyed by variant name. */
// SAFETY: the entries cover every AccentId × Scheme pair exactly once.
export const themeVariants = Object.fromEntries(
  accentIds.flatMap((accent) =>
    schemes.map((scheme) => [variantName(accent, scheme), deriveRoles(accent, scheme)] as const),
  ),
) as Record<ThemeVariant, RoleTokens>;
