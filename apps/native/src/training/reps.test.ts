import { describe, expect, it } from "vitest";

import { parseRepTarget } from "./reps";

describe("rep targets", () => {
  it("stores exact reps as equal bounds and ignores the hidden maximum", () => {
    expect(parseRepTarget("8", "12", false)).toEqual({ reps_min: 8, reps_max: 8 });
    expect(parseRepTarget("0", "", false)).toBeNull();
  });
  it("accepts a range and allows equal bounds", () => {
    expect(parseRepTarget(" 8 ", "12", true)).toEqual({ reps_min: 8, reps_max: 12 });
    expect(parseRepTarget("8", "8", true)).toEqual({ reps_min: 8, reps_max: 8 });
  });
  it("keeps incomplete or inverted ranges out of saved data", () => {
    for (const [min, max] of [
      ["12", "8"],
      ["", "10"],
      ["8", ""],
      ["1.5", "8"],
      ["-1", "8"],
      ["1", "1000"],
    ]) {
      expect(parseRepTarget(min ?? "", max ?? "", true)).toBeNull();
    }
  });
  it("clears the target only when both visible inputs are empty", () => {
    expect(parseRepTarget("", "", true)).toEqual({ reps_min: undefined, reps_max: undefined });
    expect(parseRepTarget("", "12", false)).toEqual({ reps_min: undefined, reps_max: undefined });
  });
});
