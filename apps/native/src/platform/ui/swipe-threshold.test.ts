import { describe, expect, it } from "vitest";

import { SWIPE_ACTION_WIDTH, isFullSwipe } from "./swipe-threshold";

describe("isFullSwipe", () => {
  it("fires past 55% of a wide row, in either direction", () => {
    expect(isFullSwipe(-218, 400, 1)).toBe(false);
    expect(isFullSwipe(-221, 400, 1)).toBe(true);
    expect(isFullSwipe(221, 400, 1)).toBe(true);
  });

  it("needs more than the revealed buttons on a narrow row", () => {
    const narrow = 200;
    expect(isFullSwipe(-SWIPE_ACTION_WIDTH * 2 + 1, narrow, 1)).toBe(false);
    expect(isFullSwipe(-SWIPE_ACTION_WIDTH * 2, narrow, 1)).toBe(true);
  });

  it("never fires before the row has been measured", () => {
    expect(isFullSwipe(-500, 0, 1)).toBe(false);
  });
});
