import { describe, expect, it } from "vitest";

import {
  clamp,
  dragFade,
  dragScale,
  fitContain,
  focalTranslation,
  panBound,
  rubberBandClamp,
  shouldDismiss,
} from "./image-viewer-geometry";

describe("image viewer geometry", () => {
  it("fits a picture inside a box, keeping its proportions", () => {
    expect(fitContain({ width: 1500, height: 2000 }, { width: 400, height: 800 })).toEqual({
      width: 400,
      height: 533.3333333333334,
    });
    expect(fitContain({ width: 2000, height: 1000 }, { width: 400, height: 800 })).toEqual({
      width: 400,
      height: 200,
    });
    expect(fitContain({ width: 0, height: 0 }, { width: 400, height: 800 })).toEqual({
      width: 400,
      height: 800,
    });
  });

  it("bounds a pan to the overhang of the zoomed picture", () => {
    expect(panBound(400, 1, 400)).toBe(0);
    expect(panBound(400, 2, 400)).toBe(200);
    expect(panBound(300, 1.2, 400)).toBe(0);
  });

  it("keeps the point under the fingers while the scale changes", () => {
    // Pinching on the centre of an untranslated picture leaves it centred.
    expect(focalTranslation(0, 0, 1, 3)).toBe(0);
    // A point 100 right of centre, held under a finger that stays there, moves the picture left.
    expect(focalTranslation(100, 100, 1, 2)).toBe(-100);
    expect(focalTranslation(50, 20, 0, 2)).toBe(50);
  });

  it("stretches past a limit with resistance and never reaches the full overshoot", () => {
    expect(rubberBandClamp(50, 0, 100, 400)).toBe(50);
    const stretched = rubberBandClamp(180, 0, 100, 400);
    expect(stretched).toBeGreaterThan(100);
    expect(stretched).toBeLessThan(180);
    expect(rubberBandClamp(-80, 0, 100, 400)).toBeLessThan(0);
    expect(rubberBandClamp(-80, 0, 100, 400)).toBeGreaterThan(-80);
  });

  it("dismisses on where the drag was heading, not where it was dropped", () => {
    expect(shouldDismiss(60, 0)).toBe(false);
    expect(shouldDismiss(60, 400)).toBe(true);
    expect(shouldDismiss(200, 0)).toBe(true);
    // A throw back towards the centre cancels a long drag.
    expect(shouldDismiss(150, -1000)).toBe(false);
    expect(shouldDismiss(-150, 0)).toBe(true);
  });

  it("fades the backdrop and shrinks the picture as it is dragged away", () => {
    expect(dragFade(0, 800)).toBe(1);
    expect(dragFade(320, 800)).toBeCloseTo(0.15);
    expect(dragFade(1000, 800)).toBeCloseTo(0.15);
    expect(dragScale(0, 800)).toBe(1);
    expect(dragScale(800, 800)).toBeCloseTo(0.8);
    expect(dragFade(100, 0)).toBe(1);
    expect(dragScale(100, 0)).toBe(1);
    expect(clamp(5, 0, 3)).toBe(3);
  });
});
