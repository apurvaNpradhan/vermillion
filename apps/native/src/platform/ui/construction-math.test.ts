import { describe, expect, it } from "vitest";

import { PHI, construction, spiralPaths } from "./construction-math";

describe("construction drawing", () => {
  it("draws a golden rectangle under a circle that spans its height", () => {
    const { rect, circle } = construction();
    expect(rect.width / rect.height).toBeCloseTo(PHI, 5);
    expect(circle.r * 2).toBe(rect.height);
    expect(circle.cx - circle.r).toBe(rect.x);
  });

  it("fits every shape inside the view box", () => {
    const { viewBox, rect, circle } = construction();
    expect(viewBox.x).toBeLessThan(rect.x);
    expect(viewBox.x + viewBox.width).toBeGreaterThan(rect.x + rect.width);
    expect(viewBox.y).toBeLessThan(circle.cy - circle.r);
    expect(viewBox.y + viewBox.height).toBeGreaterThan(rect.y + rect.height);
  });

  it("carves one square and one arc per turn, starting with a move", () => {
    const { squares, spiral } = spiralPaths(0, 0, 161.8, 100, 5);
    expect(squares).toHaveLength(5);
    expect(spiral.startsWith("M0 100")).toBe(true);
    expect(spiral.match(/A/g)).toHaveLength(5);
  });

  it("shrinks each square by the golden ratio", () => {
    const { squares } = spiralPaths(0, 0, 161.8034, 100, 2);
    // The first square is 100 wide; the next one on top is the remaining 61.8 wide.
    expect(squares[0]).toBe("M100 0 V100");
    expect(squares[1]).toMatch(/^M100 61\.8\d* H161\.8/);
  });
});
