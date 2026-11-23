import { describe, expect, it } from "vitest";

import {
  CYCLE_MS,
  FINAL_MS,
  ROW_COUNT,
  formatWeight,
  stepProgress,
  tickProgress,
  weightOf,
} from "./live-log-math";

describe("live log vignette", () => {
  it("steps the weight 60, 62.5, 65, 67.5", () => {
    expect(Array.from({ length: ROW_COUNT }, (_, i) => formatWeight(weightOf(i)))).toEqual([
      "60",
      "62.5",
      "65",
      "67.5",
    ]);
  });

  it("starts empty and ticks the rows one after another", () => {
    expect([0, 1, 2, 3].map((i) => tickProgress(i, 0))).toEqual([0, 0, 0, 0]);
    const at = (ms: number) => [0, 1, 2, 3].map((i) => tickProgress(i, ms));
    expect(at(1400)).toEqual([1, 0, 0, 0]);
    expect(at(2300)).toEqual([1, 1, 0, 0]);
    expect(at(FINAL_MS)).toEqual([1, 1, 1, 1]);
  });

  it("is half way through a tick part way along the ramp", () => {
    const mid = tickProgress(0, 1130);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("steps a row's weight when the row above ticks", () => {
    expect(stepProgress(0, 0)).toBe(1);
    expect(stepProgress(2, 1000)).toBe(0);
    expect(stepProgress(2, FINAL_MS)).toBe(1);
  });

  it("clears before the loop restarts", () => {
    expect(tickProgress(3, CYCLE_MS)).toBe(0);
  });
});
