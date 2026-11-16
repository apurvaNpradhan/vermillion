import { CARD_HEIGHT, CARD_WIDTH } from "./types";

/** iOS view-shot interprets its target in points; Android interprets it in pixels. */
export function captureDimensions(platform: string, pixelRatio: number) {
  const density = Math.max(1, pixelRatio);
  return {
    layoutWidth: CARD_WIDTH / density,
    layoutHeight: CARD_HEIGHT / density,
    designScale: 1 / density,
    width: platform === "ios" ? CARD_WIDTH / density : CARD_WIDTH,
    height: platform === "ios" ? CARD_HEIGHT / density : CARD_HEIGHT,
  };
}
