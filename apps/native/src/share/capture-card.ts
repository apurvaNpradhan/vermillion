import { captureRef } from "react-native-view-shot";
import type { View } from "react-native";

import type { ImageGate } from "./image-gate";
import { CARD_HEIGHT, CARD_WIDTH } from "./types";

/** How long a capture waits for local pictures still loading; it never waits on the network. */
export const IMAGE_WAIT_MS = 1500;
const JPEG_QUALITY = 0.92;

export type CapturedCard = { uri: string; mimeType: "image/jpeg" | "image/png" };

/**
 * The card as a file in the cache directory, exactly 1080 × 1920 pixels: JPEG for cards, PNG for a
 * Sticker so its transparency survives. The view is the unscaled frame inside the preview's scaled
 * wrapper, so what is saved is what is shown.
 */
export async function captureCard(
  view: View | null,
  { transparent, gate }: { transparent: boolean; gate: ImageGate },
): Promise<CapturedCard> {
  if (!view) throw new Error("The card is not on screen");
  await gate.whenIdle(IMAGE_WAIT_MS);
  const uri = await captureRef(view, {
    format: transparent ? "png" : "jpg",
    quality: JPEG_QUALITY,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    result: "tmpfile",
    fileName: `share-card-${Date.now()}`,
  });
  return { uri, mimeType: transparent ? "image/png" : "image/jpeg" };
}
