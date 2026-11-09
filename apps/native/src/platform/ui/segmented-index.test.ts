import { describe, expect, it } from "vitest";

import {
  indexAtPosition,
  indexOfValue,
  indicatorOffset,
  segmentWidth,
  stepIndex,
} from "./segmented-index";

const options = [{ value: "day" }, { value: "week" }, { value: "month" }] as const;

describe("segmented index math", () => {
  it("finds the selected option", () => {
    expect(indexOfValue(options, "week")).toBe(1);
    expect(indexOfValue(options, "month")).toBe(2);
  });

  it("splits the track evenly", () => {
    expect(segmentWidth(300, 3)).toBe(100);
    expect(segmentWidth(300, 0)).toBe(0);
    expect(indicatorOffset(2, 300, 3)).toBe(200);
    expect(indicatorOffset(-1, 300, 3)).toBe(0);
  });

  it("maps a touch position to a segment, clamped", () => {
    expect(indexAtPosition(-20, 300, 3)).toBe(0);
    expect(indexAtPosition(150, 300, 3)).toBe(1);
    expect(indexAtPosition(999, 300, 3)).toBe(2);
    expect(indexAtPosition(10, 0, 3)).toBe(0);
  });

  it("steps and stops at the ends", () => {
    expect(stepIndex(0, -1, 3)).toBe(0);
    expect(stepIndex(1, 1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(2);
  });
});
