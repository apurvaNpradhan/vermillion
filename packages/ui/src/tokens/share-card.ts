import { brandThemes, type RoleTokens, type ThemeName } from "./brand";

/**
 * Share card colours (ADR 0042): derived from a theme's roles, never hand-picked. The native
 * Share composer renders cards with these and `share-card.test.ts` holds every pair to AA.
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
  /** Marks (the Record medal, rules): a graphic, not text. */
  accent: string;
  /** Round thumbnails, letter avatars and bars. */
  plate: string;
  hairline: string;
}

/** "#rrggbb" blended: `amount` of `top` over `base`. */
export function mixHex(base: string, top: string, amount: number): string {
  const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  const part = (at: number) =>
    Math.round(channel(base, at) * (1 - amount) + channel(top, at) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${part(1)}${part(3)}${part(5)}`;
}

function neutral(roles: RoleTokens, fill: string): CardPalette {
  return {
    fill,
    glow: null,
    scrim: null,
    ground: fill,
    text: roles["text-primary"],
    textSecondary: roles["text-secondary"],
    textMuted: roles["text-muted"],
    accent: roles.identity,
    plate: roles["surface-control"],
    hairline: roles.hairline,
  };
}

/**
 * The colours of one background. `appearance` is the app's resolved light or dark mode, which only
 * the Theme background follows; Light, Dark, Photo and the Sticker use that fixed palette.
 */
export function cardPalette(
  theme: ThemeName,
  appearance: "light" | "dark",
  kind: CardPaletteKind,
): CardPalette {
  const palette = brandThemes[theme];
  switch (kind) {
    case "theme": {
      const roles = palette[appearance];
      return {
        ...neutral(roles, roles.surface),
        glow: roles.identity,
        // The glow lightens or tints the top of the card, so muted text leans on the stronger tone.
        textMuted: mixHex(roles["text-muted"], roles["text-secondary"], 0.6),
      };
    }
    case "light":
      return neutral(palette.light, palette.light.canvas);
    case "dark":
      return neutral(palette.dark, palette.dark.canvas);
    case "accent": {
      const roles = palette[appearance];
      const fill = roles.identity;
      const ink = roles["on-identity"];
      return {
        fill,
        glow: null,
        scrim: null,
        ground: fill,
        text: ink,
        // One ink: some themes' on-identity pair has little contrast to spare, so rank by size.
        textSecondary: ink,
        textMuted: ink,
        accent: ink,
        plate: mixHex(fill, ink, 0.12),
        hairline: mixHex(fill, ink, 0.3),
      };
    }
    case "photo": {
      const roles = palette.dark;
      return {
        ...neutral(roles, roles.canvas),
        fill: null,
        scrim: roles.canvas,
        // The worst case behind the text: a white photo under the scrim at its text opacity.
        ground: mixHex("#ffffff", roles.canvas, PHOTO_SCRIM_ALPHA),
      };
    }
    case "sticker": {
      const roles = palette.dark;
      return { ...neutral(roles, roles.surface), fill: null, plate: roles["surface-control"] };
    }
  }
}
