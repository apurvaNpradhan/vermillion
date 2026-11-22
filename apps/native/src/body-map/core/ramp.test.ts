import { nativeColors, nativeVariantNames } from "@workspace/ui/tokens/brand";
import { contrastRatio } from "@workspace/ui/tokens/mix";
import { describe, expect, it } from "vitest";

import { muscleArtTint, shadingMatrix, tintOpacity } from "./ramp";

describe("muscle artwork tint", () => {
  it("preserves alpha and maps darker pixels to darker shades", () => {
    const matrix = shadingMatrix("#204060", "#80A0C0");
    expect(matrix.slice(15)).toEqual([0, 0, 0, 1, 0]);
    for (const [row, shadow, highlight] of [
      [0, 32, 128],
      [5, 64, 160],
      [10, 96, 192],
    ] as const) {
      const low = matrix[row + 4] ?? 0;
      const light = matrix.slice(row, row + 3).reduce((sum, value) => sum + value, low);
      expect(low).toBeCloseTo(shadow / 255);
      expect(light).toBeCloseTo(highlight / 255);
    }
  });

  it("uses separate bands at 0, 40% and 80%", () => {
    expect(tintOpacity(0)).toBe(0);
    expect(tintOpacity(0.01)).toBe(tintOpacity(0.39));
    expect(tintOpacity(0.4)).toBeGreaterThan(tintOpacity(0.39));
    expect(tintOpacity(0.4)).toBe(tintOpacity(0.79));
    expect(tintOpacity(0.8)).toBeGreaterThan(tintOpacity(0.79));
    expect(tintOpacity(0.8)).toBe(1);
  });

  it.each(nativeVariantNames)("keeps four distinct legend shades in %s", (variant) => {
    const { legend } = muscleArtTint(nativeColors[variant].chart, variant.includes("dark"));
    expect(contrastRatio(legend.untrained, legend.low)).toBeGreaterThan(1.25);
    expect(contrastRatio(legend.low, legend.mid)).toBeGreaterThan(1.25);
    expect(contrastRatio(legend.mid, legend.high)).toBeGreaterThan(1.25);
  });
});
