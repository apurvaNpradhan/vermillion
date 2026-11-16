import { mixHex } from "../mix";
import type { AccentTokens, BaseTokens } from "./graphite";

// SAFETY: the fixed picker order also defines the accent-name union.
export const accentNames = ["mono", "vermilion", "indigo", "orchid", "sky"] as const;
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
  indigo: {
    light: { fill: "#4B54D6", ink: "#FFFFFF" },
    dark: { fill: "#8E96FF", ink: "#0C0F33" },
  },
  orchid: {
    light: { fill: "#A12BB8", ink: "#FFFFFF" },
    dark: { fill: "#D98CF2", ink: "#2A0833" },
  },
  sky: {
    light: { fill: "#0A6FA8", ink: "#FFFFFF" },
    dark: { fill: "#5CC6F5", ink: "#04202F" },
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
