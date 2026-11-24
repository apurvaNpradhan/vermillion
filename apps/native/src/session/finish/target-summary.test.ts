import { describe, expect, it } from "vitest";

import { summarizeTargets } from "./target-summary";

const kg = (weight: number) => String(weight);

describe("summarizeTargets", () => {
  it("says one weight and the set count when every changed set is the same", () => {
    expect(summarizeTargets([70, 70, 70], [80, 80, 80], kg)).toEqual({
      kind: "same",
      weight: "80",
      count: 3,
    });
  });

  it("leaves sets that keep their target out: one ticked set of three reads as one set", () => {
    expect(summarizeTargets([null, null, null], [80, null, null], kg)).toEqual({
      kind: "same",
      weight: "80",
      count: 1,
    });
  });

  it("lists the weights when they differ", () => {
    expect(summarizeTargets([null, null, null], [60, 70, 80], kg)).toEqual({
      kind: "each",
      weights: "60, 70, 80",
    });
  });

  it("shows a cleared target as a dash", () => {
    expect(summarizeTargets([80, 80], [null, 85], kg)).toEqual({
      kind: "each",
      weights: "–, 85",
    });
  });
});
