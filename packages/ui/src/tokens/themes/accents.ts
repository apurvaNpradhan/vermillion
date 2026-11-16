import { mixHex } from "../mix";
import type { AccentTokens, BaseTokens } from "./graphite";

// SAFETY: the fixed picker order also defines the accent-name union.
export const accentNames = ["mono", "vermilion", "cobalt", "violet", "teal"] as const;
export type AccentName = (typeof accentNames)[number];

/** A fill and the ink on that fill. */
interface AccentPair {
  fill: string;
  ink: string;
}

/** One accent, for light and for dark (true black reuses dark). */
export const accents: Record<AccentName, { light: AccentPair; dark: AccentPair }> = {
  mono: {
    light: { fill: "#111214", ink: "#FFFFFF" },
    dark: { fill: "#F3F4F6", ink: "#0B0C0E" },
  },
  vermilion: {
    light: { fill: "#C8380F", ink: "#FFFFFF" },
    dark: { fill: "#FF6A3D", ink: "#1F0A03" },
  },
  cobalt: {
    light: { fill: "#2F5BE0", ink: "#FFFFFF" },
    dark: { fill: "#6E9BFF", ink: "#06102A" },
  },
  violet: {
    light: { fill: "#6B4CE0", ink: "#FFFFFF" },
    dark: { fill: "#A48CFF", ink: "#130A30" },
  },
  teal: {
    light: { fill: "#0A786B", ink: "#FFFFFF" },
    dark: { fill: "#3FD0C0", ink: "#03201D" },
  },
};

/**
 * The accent's roles on one base mode. Soft and pressed tones are derived, never hand-picked.
 * `shade` is the mode's darkest neutral: hover and press darken the fill, keeping its ink readable.
 */
export function accentRoles(
  { fill, ink }: AccentPair,
  base: BaseTokens,
  shade: string,
): AccentTokens {
  return {
    chart: fill,
    identity: fill,
    "identity-soft": mixHex(base.surface, fill, 0.14),
    "on-identity": ink,
    "brand-detail": fill,
    "focus-ring": fill,
    action: fill,
    "action-hover": mixHex(fill, shade, 0.08),
    "action-pressed": mixHex(fill, shade, 0.16),
    "on-action": ink,
  };
}
