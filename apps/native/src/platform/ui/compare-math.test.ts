import { describe, expect, it } from "vitest";

import { clampRatio, ratioAfterDrag, seamPercent } from "./compare-math";

describe("compare seam", () => {
  it("clamps the seam to the frame", () => {
    expect(clampRatio(-0.2)).toBe(0);
    expect(clampRatio(1.4)).toBe(1);
    expect(clampRatio(0.3)).toBe(0.3);
  });

  it("moves with the finger as a share of the frame", () => {
    expect(ratioAfterDrag(0.5, 50, 200, 1)).toBe(0.75);
    expect(ratioAfterDrag(0.5, -50, 200, 1)).toBe(0.25);
    expect(ratioAfterDrag(0.9, 100, 200, 1)).toBe(1);
    expect(ratioAfterDrag(0.1, -100, 200, 1)).toBe(0);
  });

  it("reverses a drag where the frame reads right to left", () => {
    expect(ratioAfterDrag(0.5, 50, 200, -1)).toBe(0.25);
  });

  it("keeps the seam when the frame has no width yet", () => {
    expect(ratioAfterDrag(0.4, 80, 0, 1)).toBe(0.4);
  });

  it("reports whole percents", () => {
    expect(seamPercent(0.504)).toBe(50);
    expect(seamPercent(2)).toBe(100);
  });
});
