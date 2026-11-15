/**
 * The arithmetic behind `ImageViewer`, kept apart from the component so Node can test it.
 *
 * Source: PanelUI `image-viewer-geometry` (panelui-native 1.4.0, MIT, https://panelui.dev;
 * Copyright (c) PanelUI contributors). Changes for Vermillion (ADR 0030): only the functions
 * `ImageViewer` uses are kept (the hero flight between a thumbnail and the screen is not ported);
 * `fitContain` and `dragScale` are unchanged, `shouldDismiss` and `dragFade` keep PanelUI's
 * constants. Every function runs on the UI thread inside a gesture or an animated style, so each
 * is a worklet and none touches React Native.
 */

export type Size = { width: number; height: number };

/** How much a rubber-banded overshoot gives. Lower is stiffer. */
const RUBBER_BAND = 0.55;

export function clamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.min(Math.max(value, min), max);
}

/**
 * The largest rect with the image's proportions that fits inside the box, centred in it. An
 * image with no known size fills the box.
 */
export function fitContain(image: Size, box: Size): Size {
  "worklet";
  if (image.width <= 0 || image.height <= 0) return { width: box.width, height: box.height };
  const scale = Math.min(box.width / image.width, box.height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

/**
 * How far past its limit a value is allowed to travel, given how far it was pushed. The
 * resistance grows with the push and never quite reaches `dimension`.
 */
function rubberBand(overshoot: number, dimension: number): number {
  "worklet";
  if (dimension <= 0) return 0;
  return (1 - 1 / ((overshoot * RUBBER_BAND) / dimension + 1)) * dimension;
}

/** Clamps to `[min, max]`, letting the value stretch past either end with resistance. */
export function rubberBandClamp(value: number, min: number, max: number, dimension: number) {
  "worklet";
  const clamped = clamp(value, min, max);
  const overshoot = Math.abs(value - clamped);
  if (overshoot === 0) return clamped;
  const sign = value < clamped ? -1 : 1;
  return clamped + sign * rubberBand(overshoot, dimension);
}

/**
 * How far a zoomed image may be moved along one axis before its edge comes away from the
 * screen's. Zero while the scaled image is smaller than the screen, which keeps it centred.
 */
export function panBound(fitted: number, scale: number, viewport: number): number {
  "worklet";
  return Math.max(0, (fitted * scale - viewport) / 2);
}

/**
 * The translation that keeps a point under the fingers while the scale changes. `offset` is where
 * that point sat relative to the image's centre when the pinch began, at `fromScale`; `focal` is
 * the fingers' position now, relative to the screen's centre. The result is measured from the
 * screen's centre too.
 */
export function focalTranslation(
  focal: number,
  offset: number,
  fromScale: number,
  toScale: number,
): number {
  "worklet";
  if (fromScale === 0) return focal;
  return focal - offset * (toScale / fromScale);
}

/** How far a drag has to travel, counting where it was flung, to close the viewer. */
export const DISMISS_DISTANCE = 110;

/**
 * Whether a released drag closes the viewer. Measured on where the image was heading rather than
 * where it was dropped, so a quick flick closes it from a short distance and a slow drag that is
 * let go of carefully does not. A throw back towards the centre cancels.
 */
export function shouldDismiss(translation: number, velocity: number): boolean {
  "worklet";
  const projected = translation + velocity * 0.2;
  if (Math.abs(projected) <= DISMISS_DISTANCE) return false;
  return translation === 0 || Math.sign(projected) === Math.sign(translation);
}

/**
 * How much of the backdrop is left while the image is dragged away from the centre. It is mostly
 * gone by the time the drag would close the viewer, so the page coming back into focus is the
 * warning that letting go will close it.
 */
export function dragFade(distance: number, viewport: number): number {
  "worklet";
  if (viewport <= 0) return 1;
  return 1 - clamp(Math.abs(distance) / (viewport * 0.4), 0, 1) * 0.85;
}

/** How small the image gets while it is dragged. Never below 0.8 of its size. */
export function dragScale(distance: number, viewport: number): number {
  "worklet";
  if (viewport <= 0) return 1;
  return 1 - clamp(Math.abs(distance) / viewport, 0, 1) * 0.2;
}
