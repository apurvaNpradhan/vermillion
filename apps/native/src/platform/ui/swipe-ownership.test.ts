import { describe, expect, it } from "vitest";

import { dismissSwipeRow, releaseSwipeRow } from "./swipe-ownership";

describe("swipe row ownership", () => {
  it("retains the active pan when an unrelated gesture finalizes", () => {
    expect(releaseSwipeRow("second", "first")).toBe("second");
    expect(releaseSwipeRow("second", "second")).toBeNull();
  });

  it("keeps a newly activated row open when a JS dismissal arrives late", () => {
    expect(dismissSwipeRow("row", "row")).toBe("row");
  });

  it("dismisses a settled row when a scroll begins or another row is touched", () => {
    expect(dismissSwipeRow("open", null)).toBeNull();
    expect(dismissSwipeRow("open", null, "other")).toBeNull();
    expect(dismissSwipeRow("open", null, "open")).toBe("open");
  });
});
