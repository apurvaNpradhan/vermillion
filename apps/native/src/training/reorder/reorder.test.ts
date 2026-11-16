import { describe, expect, it } from "vitest";

import { autoScrollSpeed, indexFromPosition } from "./reorder";

describe("dragging in an outer scroll view", () => {
  it("includes the content above the list, scroll offset and grab point", () => {
    // List starts at 400 in scroll content. Viewport finger is 250, scrolled by 300.
    expect(indexFromPosition(250, 400, 300, 22, 64, 8)).toBe(2);
    expect(indexFromPosition(250, 400, 364, 22, 64, 8)).toBe(3);
  });

  it("keeps the same slot when the viewport and list move together", () => {
    expect(indexFromPosition(200, 100, 0, 20, 64, 8)).toBe(
      indexFromPosition(300, 200, 0, 20, 64, 8),
    );
  });

  it("clamps above and below the list and handles empty lists", () => {
    expect(indexFromPosition(-200, 100, 0, 20, 64, 8)).toBe(0);
    expect(indexFromPosition(2000, 100, 0, 20, 64, 8)).toBe(7);
    expect(indexFromPosition(200, 100, 0, 20, 64, 0)).toBe(-1);
  });
});

describe("edge auto-scroll", () => {
  it("stops in the middle and at the inner edge of each band", () => {
    for (const y of [172, 400, 628]) expect(autoScrollSpeed(y, 100, 700)).toBe(0);
  });

  it("ramps symmetrically and caps speed outside the viewport", () => {
    expect(autoScrollSpeed(136, 100, 700)).toBe(-150);
    expect(autoScrollSpeed(664, 100, 700)).toBe(150);
    expect(autoScrollSpeed(100, 100, 700)).toBe(-600);
    expect(autoScrollSpeed(700, 100, 700)).toBe(600);
    expect(autoScrollSpeed(-1000, 100, 700)).toBe(-600);
    expect(autoScrollSpeed(2000, 100, 700)).toBe(600);
  });

  it("handles small, empty and reversed viewports", () => {
    expect(autoScrollSpeed(120, 100, 140)).toBe(0);
    expect(autoScrollSpeed(100, 100, 140)).toBe(-600);
    expect(autoScrollSpeed(140, 100, 140)).toBe(600);
    expect(autoScrollSpeed(140, 140, 140)).toBe(0);
    expect(autoScrollSpeed(100, 140, 100)).toBe(0);
  });
});
