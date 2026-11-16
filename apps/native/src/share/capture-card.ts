import { captureRef, releaseCapture } from "react-native-view-shot";
import { PixelRatio, Platform, type View } from "react-native";
import { captureDimensions } from "./capture-dimensions";
import { ownCapture } from "./share-cache";

import type { ImageGate } from "./image-gate";

/** How long a capture waits for local pictures still loading; it never waits on the network. */
export const IMAGE_WAIT_MS = 1500;
const JPEG_QUALITY = 0.92;

export type CapturedCard = { uri: string; mimeType: "image/jpeg" | "image/png" };

/**
 * The card as a file in the cache directory, exactly 1080 × 1920 pixels: JPEG for cards, PNG for a
 * Sticker so its transparency survives. The view is the density-adjusted frame inside the preview's scaled
 * wrapper, so what is saved is what is shown.
 */
export async function captureCard(
  view: View | null,
  { transparent, gate }: { transparent: boolean; gate: ImageGate },
): Promise<CapturedCard> {
  if (!view) throw new Error("The card is not on screen");
  await gate.whenIdle(IMAGE_WAIT_MS);
  const target = captureDimensions(Platform.OS, PixelRatio.get());
  const uri = await captureRef(view, {
    format: transparent ? "png" : "jpg",
    quality: JPEG_QUALITY,
    width: target.width,
    height: target.height,
    result: "tmpfile",
    fileName: `share-card-${Date.now()}`,
  });
  try {
    return {
      uri: ownCapture(uri, transparent),
      mimeType: transparent ? "image/png" : "image/jpeg",
    };
  } finally {
    // view-shot owns its temporary files, including iOS NSTemporaryDirectory()/ReactNative.
    releaseCapture(uri);
  }
}
