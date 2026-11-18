import { describe, expect, it } from "vitest";

import {
  labelAnchor,
  polarPoint,
  radarDomain,
  radarPath,
  ringPoints,
  toFractions,
} from "./radar-chart-math";

describe("polarPoint", () => {
  it("starts at twelve o'clock and turns clockwise", () => {
    const top = polarPoint(50, 50, 40, 0);
    expect(top.x).toBeCloseTo(50);
    expect(top.y).toBeCloseTo(10);
    const right = polarPoint(50, 50, 40, 0.25);
    expect(right.x).toBeCloseTo(90);
    expect(right.y).toBeCloseTo(50);
  });
});

describe("radarPath", () => {
  it("closes a shape through each fraction", () => {
    expect(radarPath([1, 1, 1, 1], 50, 50, 40)).toBe(
      "M50.00,10.00L90.00,50.00L50.00,90.00L10.00,50.00Z",
    );
  });
  it("puts a missing value at the centre", () => {
    expect(radarPath([null, null, null], 0, 0, 10)).toBe("M0.00,0.00L0.00,0.00L0.00,0.00Z");
  });
  it("draws nothing under three axes", () => {
    expect(radarPath([1, 1], 0, 0, 10)).toBe("");
  });
});

describe("ringPoints", () => {
  it("lists one corner per axis", () => {
    expect(ringPoints(4, 50, 50, 40).split(" ")).toHaveLength(4);
  });
});

describe("radarDomain", () => {
  it("uses a fixed maximum when given", () => {
    expect(radarDomain([3], [null], 10)).toBe(10);
  });
  it("adds headroom over the biggest value or target", () => {
    expect(radarDomain([10, 4], [20, null])).toBeCloseTo(22);
  });
  it("never collapses to zero", () => {
    expect(radarDomain([0, 0], [null, null])).toBe(1);
  });
});

describe("toFractions", () => {
  it("scales and clamps", () => {
    expect(toFractions([5, 20, null, -1], 10)).toEqual([0.5, 1, null, 0]);
  });
});

describe("labelAnchor", () => {
  it("centres the top and bottom labels and pushes the sides away", () => {
    expect(labelAnchor(1, 100)).toBe("middle");
    expect(labelAnchor(60, 100)).toBe("start");
    expect(labelAnchor(-60, 100)).toBe("end");
  });
});
