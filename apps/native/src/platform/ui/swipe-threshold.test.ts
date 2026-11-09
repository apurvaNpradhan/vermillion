import { describe, expect, it } from "vitest";

import { SWIPE_ACTION_WIDTH, isFullSwipe, shouldSettleOpen } from "./swipe-threshold";

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

describe("shouldSettleOpen", () => {
  it("opens past half the panel at rest", () => {
    expect(shouldSettleOpen(-100, 0, 160)).toBe(true);
    expect(shouldSettleOpen(-60, 0, 160)).toBe(false);
  });

  it("opens on a short flick towards the open side", () => {
    expect(shouldSettleOpen(-40, -800, 160)).toBe(true);
  });

  it("closes on a flick away even when dragged past half", () => {
    expect(shouldSettleOpen(-100, 800, 160)).toBe(false);
  });
});
