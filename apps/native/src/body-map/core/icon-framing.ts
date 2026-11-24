import { BODY_ASPECT } from "./body-canvas";
import { PREFERRED_VIEW } from "./group-layers";
import type { BodyGroup, BodyView } from "./groups";
import { groupBounds } from "./hit-test";

/**
 * Per-group tuning of a group icon's framing, on top of the fit to the group's bounding box.
 * `zoom` scales the fitted body (above 1 crops closer), `dx` and `dy` shift the framed centre in
 * fractions of the group's box (positive moves the centre right / down). An empty entry is the
 * plain fit; every group has an entry so a new group is a deliberate choice.
 */
export const ICON_FRAMING = {
  abdominals: { zoom: 1 },
  abductors: { zoom: 1.15 },
  adductors: { zoom: 1.3 },
  biceps: { zoom: 1.2 },
  calves: { zoom: 1.1 },
  chest: { zoom: 1 },
  forearms: { zoom: 1.25 },
  glutes: { zoom: 1 },
  hamstrings: { zoom: 1.2 },
  lats: { zoom: 1 },
  lower_back: { zoom: 1 },
  neck: { zoom: 1.15 },
  quadriceps: { zoom: 1.15 },
  shoulders: { zoom: 1 },
  traps: { zoom: 1.15 },
  triceps: { zoom: 1.2 },
  upper_back: { zoom: 1 },
} as const satisfies Record<BodyGroup, { zoom?: number; dx?: number; dy?: number }>;

/** How much of the disc the group's extent fills; the rest is breathing room. */
const FILL = 0.8;
/**
 * The framed extent is this blend of the box's longer side and its diagonal: a circle clips the
 * corners of a box, so a pure diagonal fit shrinks tall groups, a pure side fit crops them.
 */
const DIAGONAL_WEIGHT = 0.5;
/** The most the body is enlarged, in disc diameters of body height. */
const MAX_BODY_HEIGHT = 9;

export type IconFrame = {
  /** Size and offset of the full body canvas inside the disc, in points. */
  bodyWidth: number;
  bodyHeight: number;
  left: number;
  top: number;
};

type Bounds = { x0: number; y0: number; x1: number; y1: number };

/** Frame a box of the canvas (fractions) so its extent fills `FILL` of a disc `size` wide. */
function frameBounds(
  bounds: Bounds,
  size: number,
  tuning: { zoom?: number; dx?: number; dy?: number },
) {
  const width = (bounds.x1 - bounds.x0) * BODY_ASPECT;
  const height = bounds.y1 - bounds.y0;
  const extent =
    Math.max(width, height) * (1 - DIAGONAL_WEIGHT) + Math.hypot(width, height) * DIAGONAL_WEIGHT;
  const bodyHeight = Math.min(
    ((size * FILL) / extent) * (tuning.zoom ?? 1),
    size * MAX_BODY_HEIGHT,
  );
  const bodyWidth = bodyHeight * BODY_ASPECT;
  const centreX =
    ((bounds.x0 + bounds.x1) / 2 + (tuning.dx ?? 0) * (bounds.x1 - bounds.x0)) * bodyWidth;
  const centreY =
    ((bounds.y0 + bounds.y1) / 2 + (tuning.dy ?? 0) * (bounds.y1 - bounds.y0)) * bodyHeight;
  return { bodyWidth, bodyHeight, left: size / 2 - centreX, top: size / 2 - centreY };
}

/** Where to place the whole body canvas so the group sits centred and sized in a disc. */
export function iconFrame(group: BodyGroup, size: number): IconFrame | undefined {
  const bounds = groupBounds(group, PREFERRED_VIEW[group]);
  if (!bounds) return undefined;
  const tuning: { zoom?: number; dx?: number; dy?: number } = ICON_FRAMING[group];
  return frameBounds(bounds, size, tuning);
}

/** The same for several groups at once: the box that holds all of them in one view. */
export function regionFrame(
  groups: readonly BodyGroup[],
  view: BodyView,
  size: number,
): IconFrame | undefined {
  const boxes = groups.flatMap((group) => groupBounds(group, view) ?? []);
  if (boxes.length === 0) return undefined;
  return frameBounds(
    {
      x0: Math.min(...boxes.map((box) => box.x0)),
      y0: Math.min(...boxes.map((box) => box.y0)),
      x1: Math.max(...boxes.map((box) => box.x1)),
      y1: Math.max(...boxes.map((box) => box.y1)),
    },
    size,
    {},
  );
}
