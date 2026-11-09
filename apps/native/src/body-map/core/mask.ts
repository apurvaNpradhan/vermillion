// A coarse alpha mask per layer, generated from the art (`assets/interim/generate-assets.ts`). A
// tap on the picture is a point on the canvas; the mask says which layers are drawn under it. The
// grid is about 6 canvas pixels a cell: finer than a fingertip, small enough to commit.

export const GRID_WIDTH = 50;
export const GRID_HEIGHT = 123;

/** The cells of a layer's bounding box, one bit each, row by row, base64. */
export type LayerMask = {
  x0: number;
  y0: number;
  w: number;
  h: number;
  bits: string;
};

export type DecodedMask = LayerMask & { bytes: Uint8Array; area: number };

const decoded = new Map<LayerMask, DecodedMask>();

function bytesOf(base64: string): Uint8Array {
  const text = atob(base64);
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

export function decodeMask(mask: LayerMask): DecodedMask {
  const known = decoded.get(mask);
  if (known) return known;
  const bytes = bytesOf(mask.bits);
  let area = 0;
  for (let bit = 0; bit < mask.w * mask.h; bit++) {
    if (((bytes[bit >> 3] ?? 0) & (1 << (bit & 7))) !== 0) area++;
  }
  const result = { ...mask, bytes, area };
  decoded.set(mask, result);
  return result;
}

/** Whether the canvas point (0..1 across, 0..1 down) falls on a drawn cell of the layer. */
export function maskCovers(mask: DecodedMask, x: number, y: number): boolean {
  const column = Math.floor(x * GRID_WIDTH) - mask.x0;
  const row = Math.floor(y * GRID_HEIGHT) - mask.y0;
  if (column < 0 || row < 0 || column >= mask.w || row >= mask.h) return false;
  const bit = row * mask.w + column;
  return ((mask.bytes[bit >> 3] ?? 0) & (1 << (bit & 7))) !== 0;
}
