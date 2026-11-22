import { nativeColors, type NativeVariant, type RoleTokens } from "./brand";
import { mixHex } from "./mix";

export { mixHex };

/**
 * Share card colours (ADR 0042): derived from the theme's roles, never hand-picked. The native
 * Share composer renders cards with these and `share-card.test.ts` holds every pair to AA.
 * Sigil cards use two inks and no glow; ember (`record`) marks personal records only. Classic
 * cards keep the accent glow and draw records in their accent.
 */

/** The backgrounds a card offers. Photo only exists when the card has a picture. */
export const CARD_BACKGROUNDS = ["theme", "accent", "light", "dark", "photo"] as const;
export type CardBackground = (typeof CARD_BACKGROUNDS)[number];

/** A background, or the Sticker's own transparent canvas with a solid block. */
export type CardPaletteKind = CardBackground | "sticker";

/** How strongly the theme background's accent glow tints the top of the card (0..1). */
export const GLOW_ALPHA = 0.12;
/** The photo scrim's opacity across the entire card, including the headings at y=168. */
export const PHOTO_SCRIM_ALPHA = 0.9;

export interface CardPalette {
  /** The card's flat colour; null on a photo or a transparent canvas. */
  fill: string | null;
  /** The accent of the soft glow at the top (theme background only). */
  glow: string | null;
  /** The photo scrim's colour (photo background only). */
  scrim: string | null;
  /** The solid colour the text sits on: the fill, the sticker block, or the scrim over white. */
  ground: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** Marks (rules, bars): a graphic, not text. In Sigil this is ink. */
  accent: string;
  /** The personal-record mark and the footer mark's dot: ember in Sigil. A graphic, not text. */
  record: string;
  /** Round thumbnails, letter avatars and bars. */
  plate: string;
  hairline: string;
}

/** Whether a variant belongs to Classic; the built-in `light` and `dark` are Sigil. */
const isClassic = (variant: NativeVariant) => variant.startsWith("classic");

function neutral(roles: RoleTokens, fill: string, classic = false): CardPalette {
  return {
    fill,
    glow: null,
    scrim: null,
    ground: fill,
    text: roles["text-primary"],
    textSecondary: roles["text-secondary"],
    textMuted: roles["text-muted"],
    accent: classic ? roles.identity : roles["text-primary"],
    record: classic ? roles.identity : roles["brand-detail"],
    plate: roles["surface-control"],
    hairline: roles.hairline,
  };
}

/**
 * The colours of one background. `appearance` is the app's applied theme variant, which only
 * the Theme and Accent backgrounds follow; Light, Dark, Photo and the Sticker use that fixed palette.
 */
export function cardPalette(appearance: NativeVariant, kind: CardPaletteKind): CardPalette {
  const classic = isClassic(appearance);
  const light = nativeColors[classic ? "classic-light" : "light"];
  const dark = nativeColors[classic ? "classic-dark" : "dark"];
  switch (kind) {
    case "theme": {
      const roles = nativeColors[appearance];
      if (!classic) return neutral(roles, roles.surface);
      return {
        ...neutral(roles, roles.surface, true),
        glow: roles.identity,
        // The glow lightens or tints the top of the card, so muted text leans on the stronger tone.
        textMuted: mixHex(roles["text-muted"], roles["text-secondary"], 0.6),
      };
    }
    case "light":
      return neutral(light, light.canvas, classic);
    case "dark":
      return neutral(dark, dark.canvas, classic);
    case "accent": {
      const roles = nativeColors[appearance];
      if (!classic) {
        // Sigil's accent card is the ink: ivory on dark, near-black on light. The record mark takes
        // the other scheme's ember so it keeps its contrast against the ink fill.
        const dark = appearance === "dark" || appearance.includes("-dark");
        const other = nativeColors[dark ? "light" : "dark"];
        const fill = roles.action;
        const ink = roles["on-action"];
        return {
          fill,
          glow: null,
          scrim: null,
          ground: fill,
          text: ink,
          textSecondary: ink,
          textMuted: ink,
          accent: ink,
          record: other["brand-detail"],
          plate: mixHex(fill, ink, 0.12),
          hairline: mixHex(fill, ink, 0.3),
        };
      }
      const fill = roles.identity;
      const ink = roles["on-identity"];
      return {
        fill,
        glow: null,
        scrim: null,
        ground: fill,
        text: ink,
        // Use size to distinguish text roles on the accent fill.
        textSecondary: ink,
        textMuted: ink,
        accent: ink,
        record: ink,
        plate: mixHex(fill, ink, 0.12),
        hairline: mixHex(fill, ink, 0.3),
      };
    }
    case "photo": {
      const roles = dark;
      return {
        ...neutral(roles, roles.canvas, classic),
        fill: null,
        scrim: roles.canvas,
        // The worst case behind the text: a white photo under the scrim at its text opacity.
        ground: mixHex("#ffffff", roles.canvas, PHOTO_SCRIM_ALPHA),
      };
    }
    case "sticker": {
      const roles = dark;
      return {
        ...neutral(roles, roles.surface, classic),
        fill: null,
        plate: roles["surface-control"],
      };
    }
  }
}
