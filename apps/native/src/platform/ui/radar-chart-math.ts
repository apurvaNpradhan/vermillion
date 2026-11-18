/**
 * Source: PanelUI RadarChart and lib/chart (panelui-native 1.4.0, MIT, https://panelui.dev).
 * Copyright (c) 2026 Khalid Abdi. See THIRD_PARTY_NOTICES.md.
 * The polar helpers, the domain rule and the label anchoring, pulled out of the component so
 * they can be tested. `polarPoint` and `radarPath` run on the UI thread, so they are worklets.
 */

export type Point = { x: number; y: number };

/** A point at `radius` from the centre, `turn` of a full turn clockwise from twelve o'clock. */
export function polarPoint(cx: number, cy: number, radius: number, turn: number): Point {
  "worklet";
  const angle = turn * Math.PI * 2;
  return { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) };
}

/**
 * The closed outline through one fraction (0 to 1 of the radius) per axis. A missing value sits
 * at the centre, so the shape still closes; nothing at all draws nothing.
 */
export function radarPath(
  fractions: readonly (number | null)[],
  cx: number,
  cy: number,
  radius: number,
): string {
  "worklet";
  const count = fractions.length;
  if (count < 3) return "";
  let path = "";
  for (let index = 0; index < count; index += 1) {
    const fraction = fractions[index];
    const point = polarPoint(cx, cy, radius * (fraction ?? 0), index / count);
    path += `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }
  return `${path}Z`;
}

/** The corners of a ring at `radius`, for a polygonal grid. */
export function ringPoints(count: number, cx: number, cy: number, radius: number): string {
  return Array.from({ length: count }, (_, index) => {
    const point = polarPoint(cx, cy, radius, index / count);
    return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(" ");
}

/**
 * The value the outer ring stands for. A fixed `max` wins; otherwise the biggest value (or
 * target) with a tenth of headroom, and never below 1 so an empty chart still has a scale.
 * From zero, always: a floor above zero makes a small value look large.
 */
export function radarDomain(
  values: readonly number[],
  targets: readonly (number | null)[],
  max?: number,
): number {
  if (max !== undefined && max > 0) return max;
  const peak = Math.max(0, ...values, ...targets.map((target) => target ?? 0));
  return peak === 0 ? 1 : peak * 1.1;
}

/** Each value as a fraction of the domain, clamped to the outer ring. */
export function toFractions(values: readonly (number | null)[], domain: number): (number | null)[] {
  return values.map((value) =>
    value === null ? null : Math.min(1, Math.max(0, value / Math.max(domain, 1e-6))),
  );
}

/** Which side of the circle a label hangs from: centred near the vertical, else away from it. */
export function labelAnchor(dx: number, radius: number): "start" | "middle" | "end" {
  return Math.abs(dx) < radius * 0.15 ? "middle" : dx > 0 ? "start" : "end";
}
