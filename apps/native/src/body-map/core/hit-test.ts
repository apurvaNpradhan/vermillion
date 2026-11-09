import { GROUP_LAYERS } from "./group-layers";
import type { BodyGroup, BodyView } from "./groups";
import { BODY_GROUPS } from "./groups";
import { HIT_MASKS } from "./hit-masks.generated";
import { GRID_HEIGHT, GRID_WIDTH, decodeMask, maskCovers } from "./mask";

/**
 * The group under a point of the canvas (x across and y down, each 0..1), or `undefined` for bare
 * body. Where drawings overlap the highlighted groups win, then the smaller drawing, so a small
 * muscle lying on a large one can still be tapped.
 */
export function groupAt(
  view: BodyView,
  x: number,
  y: number,
  highlighted: ReadonlySet<BodyGroup> = new Set(),
): BodyGroup | undefined {
  let best: { group: BodyGroup; marked: boolean; area: number } | undefined;
  for (const group of BODY_GROUPS) {
    for (const layer of GROUP_LAYERS[group][view]) {
      const decodedMask = decodeMask(HIT_MASKS[layer]);
      if (!maskCovers(decodedMask, x, y)) continue;
      const candidate = { group, marked: highlighted.has(group), area: decodedMask.area };
      if (best === undefined || beats(candidate, best)) best = candidate;
    }
  }
  return best?.group;
}

/** Highlighted before plain, then the smaller drawing; the earlier group wins a tie. */
function beats(a: { marked: boolean; area: number }, b: { marked: boolean; area: number }) {
  if (a.marked !== b.marked) return a.marked;
  return a.area < b.area;
}

/**
 * The bounding box of a group's layers in a view, in canvas fractions (0..1), or `undefined` when
 * the group is not drawn there. A small group icon zooms to it.
 */
export function groupBounds(
  group: BodyGroup,
  view: BodyView,
): { x0: number; y0: number; x1: number; y1: number } | undefined {
  let box: { x0: number; y0: number; x1: number; y1: number } | undefined;
  for (const layer of GROUP_LAYERS[group][view]) {
    const mask = HIT_MASKS[layer];
    const next = {
      x0: mask.x0 / GRID_WIDTH,
      y0: mask.y0 / GRID_HEIGHT,
      x1: (mask.x0 + mask.w) / GRID_WIDTH,
      y1: (mask.y0 + mask.h) / GRID_HEIGHT,
    };
    box = box
      ? {
          x0: Math.min(box.x0, next.x0),
          y0: Math.min(box.y0, next.y0),
          x1: Math.max(box.x1, next.x1),
          y1: Math.max(box.y1, next.y1),
        }
      : next;
  }
  return box;
}
