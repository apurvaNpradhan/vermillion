import type { CardBackground, CardPalette } from "@workspace/ui/tokens/share-card";
import type { ReactNode } from "react";

/** What a Share card is about. Each kind remembers its own choices on the device. */
export const SHARE_KINDS = ["session", "workout", "program"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

/** The card's fixed size in logical units; the capture is exactly this many pixels. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

/** A privacy toggle under the preview. `remember: false` ones always start at `defaultOn`. */
export type ShareToggle<Id extends string> = {
  id: Id;
  label: string;
  defaultOn: boolean;
  remember: boolean;
};

/** What a template needs to draw itself: the palette of the chosen background and the toggles. */
export type CardContext<Id extends string> = {
  palette: CardPalette;
  toggles: Readonly<Record<Id, boolean>>;
};

/**
 * One page of the composer. A card kind with several pages (a Program) lists them all as
 * templates.
 */
export type ShareTemplate<Id extends string> = {
  id: string;
  label: string;
  render: (context: CardContext<Id>) => ReactNode;
  /**
   * A Sticker: drawn on a transparent canvas with its own solid block, exported as PNG, without
   * the footer and without background swatches.
   */
  supportsTransparent: boolean;
  /** Offered only while this toggle is on. */
  requires?: Id;
  /** The card always uses this background (the Photo template). */
  fixedBackground?: Extract<CardBackground, "photo">;
};

/** A picture that can fill the card behind the content, offered as the Photo background. */
export type SharePhoto<Id extends string> = {
  /** The toggle that gates the Photo background. */
  requires: Id;
  /** A full-bleed picture; the composer places it behind the content and adds the scrim. */
  render: () => ReactNode;
};
