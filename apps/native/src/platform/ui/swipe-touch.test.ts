import { describe, expect, it } from "vitest";

import { rowToClose, shouldCloseOnTouchCancel } from "./swipe-touch";

const start = { x: 200, y: 400 };

describe("shouldCloseOnTouchCancel", () => {
  it("closes on a mostly vertical cancel (a scroll)", () => {
    expect(shouldCloseOnTouchCancel(start, { x: 205, y: 300 }, false)).toBe(true);
  });

  it("keeps rows on a horizontal cancel (a swipe)", () => {
    expect(shouldCloseOnTouchCancel(start, { x: 100, y: 405 }, false)).toBe(false);
  });

  it("ignores the cancel reported at the origin", () => {
    expect(shouldCloseOnTouchCancel(start, { x: 0, y: 0 }, false)).toBe(false);
  });

  it("ignores any cancel while a row is dragging", () => {
    expect(shouldCloseOnTouchCancel(start, { x: 200, y: 100 }, true)).toBe(false);
  });
});

describe("rowToClose", () => {
  it("returns the open row", () => {
    expect(rowToClose("a", null)).toBe("a");
    expect(rowToClose("a", "b")).toBe("a");
  });

  it("never returns the row being dragged", () => {
    expect(rowToClose("a", "a")).toBeNull();
  });

  it("returns null when nothing is open", () => {
    expect(rowToClose(null, "a")).toBeNull();
  });
});
