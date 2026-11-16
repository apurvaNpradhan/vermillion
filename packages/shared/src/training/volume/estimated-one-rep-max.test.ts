import { describe, expect, it } from "vitest";

import { estimatedOneRepMax } from "./volume";

describe("estimatedOneRepMax", () => {
  it("is Brzycki for 1 to 12 reps", () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
    expect(estimatedOneRepMax(100, 5)).toBeCloseTo(112.5, 10);
    expect(estimatedOneRepMax(100, 10)).toBeCloseTo(133.333, 3);
    expect(estimatedOneRepMax(100, 12)).toBeCloseTo(144, 10);
  });

  it("is null outside 1 to 12 reps, for fractions and for no weight", () => {
    expect(estimatedOneRepMax(100, 0)).toBeNull();
    expect(estimatedOneRepMax(100, 13)).toBeNull();
    expect(estimatedOneRepMax(100, 5.5)).toBeNull();
    expect(estimatedOneRepMax(0, 5)).toBeNull();
  });
});
