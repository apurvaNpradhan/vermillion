import { MEDIA_LIMITS, fitWithin } from "@workspace/shared";

/** JPEG quality of the full image and of the thumbnail (0 to 1). */
export const FULL_QUALITY = 0.85;
export const THUMB_QUALITY = 0.8;

export type Crop = { originX: number; originY: number; width: number; height: number };

/**
 * The centred largest square of a picture that is not one, or null when it already is. A picker
 * that ignored the 1:1 crop is cut here.
 */
export function centredSquare(width: number, height: number): Crop | null {
  if (width === height) return null;
  const side = Math.min(width, height);
  return {
    originX: Math.floor((width - side) / 2),
    originY: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}

export type ImagePlan = {
  /** Cut the picked picture to this first, or null for none. */
  crop: Crop | null;
  /** Size of the full image: its long edge at most {@link MEDIA_LIMITS.fullEdge}. */
  full: { width: number; height: number };
  /** Size of the thumbnail: its long edge at most {@link MEDIA_LIMITS.thumbEdge}. */
  thumb: { width: number; height: number };
};

/**
 * Sizes a picked picture is re-encoded to (ADR 0040): a full image and a thumbnail, never scaled
 * up. `square` first cuts the centred square, for covers and avatars.
 */
export function planImage(width: number, height: number, square: boolean): ImagePlan {
  const crop = square ? centredSquare(width, height) : null;
  const sourceWidth = crop?.width ?? width;
  const sourceHeight = crop?.height ?? height;
  return {
    crop,
    full: fitWithin(sourceWidth, sourceHeight, MEDIA_LIMITS.fullEdge),
    thumb: fitWithin(sourceWidth, sourceHeight, MEDIA_LIMITS.thumbEdge),
  };
}
