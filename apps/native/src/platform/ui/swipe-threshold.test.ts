import { describe, expect, it } from "vitest";

import { shouldSettleOpen } from "./swipe-threshold";

describe("shouldSettleOpen", () => {
  it("opens past half the panel at rest", () => {
    expect(shouldSettleOpen(-100, 0, 160)).toBe(true);
    expect(shouldSettleOpen(-60, 0, 160)).toBe(false);
  });

  it("keeps long swipes open, regardless of how far they travel", () => {
    expect(shouldSettleOpen(-1000, 0, 88)).toBe(true);
    expect(shouldSettleOpen(-1000, -2000, 164)).toBe(true);
  });

  it("closes at exactly half the panel or on the closed side", () => {
    expect(shouldSettleOpen(-80, 0, 160)).toBe(false);
    expect(shouldSettleOpen(0, 0, 160)).toBe(false);
    expect(shouldSettleOpen(100, 0, 160)).toBe(false);
  });

  it("opens on a short flick towards the open side", () => {
    expect(shouldSettleOpen(-40, -800, 160)).toBe(true);
  });

  it("closes on a flick away even when dragged past half", () => {
    expect(shouldSettleOpen(-100, 800, 160)).toBe(false);
  });
});
