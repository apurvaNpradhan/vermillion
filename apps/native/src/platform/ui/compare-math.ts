/**
 * The seam arithmetic behind `Compare` (a pure sibling file, ADR 0030).
 *
 * Source: PanelUI `Compare` (panelui-native 1.4.0, MIT, https://panelui.dev; Copyright (c)
 * PanelUI contributors). The seam is a ratio from 0 to 1 of the frame's width, measured from the
 * reading edge. Both functions run on the UI thread, so both are worklets.
 */

export function clampRatio(value: number): number {
  "worklet";
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Where the seam is after a drag: its ratio at the start plus the finger's travel as a share of
 * the frame. `direction` is -1 where the frame reads right to left, so a drag towards the
 * leading edge keeps meaning the same thing.
 */
export function ratioAfterDrag(
  start: number,
  translationX: number,
  extent: number,
  direction: 1 | -1,
): number {
  "worklet";
  if (extent <= 0) return clampRatio(start);
  return clampRatio(start + (translationX * direction) / extent);
}

/** Whole percent, the unit the seam is reported and spoken in. */
export function seamPercent(ratio: number): number {
  "worklet";
  return Math.round(clampRatio(ratio) * 100);
}
