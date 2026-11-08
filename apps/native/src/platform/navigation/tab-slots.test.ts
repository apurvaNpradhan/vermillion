import { describe, expect, it } from "vitest";

import { scrubIndex, switcherRoute, tabSlots } from "./tab-slots";

describe("tabSlots", () => {
  it("puts the first two routes on the pill and the rest in the menu", () => {
    expect(tabSlots(["index", "notes", "settings"])).toEqual({
      direct: ["index", "notes"],
      overflow: ["settings"],
    });
  });

  it("leaves the menu empty when every route fits on the pill", () => {
    expect(tabSlots(["index"])).toEqual({ direct: ["index"], overflow: [] });
  });

  it("drops routes past five", () => {
    expect(tabSlots(["a", "b", "c", "d", "e", "f"]).overflow).toEqual(["c", "d", "e"]);
  });
});

describe("switcherRoute", () => {
  const overflow = ["settings", "progress"];

  it("shows the open route when it is in the menu", () => {
    expect(switcherRoute(overflow, "progress", "settings")).toBe("progress");
  });

  it("remembers the last menu route while a pill tab is open", () => {
    expect(switcherRoute(overflow, "index", "progress")).toBe("progress");
  });

  it("falls back to the first menu route, or null without one", () => {
    expect(switcherRoute(overflow, "index", null)).toBe("settings");
    expect(switcherRoute(overflow, "index", "gone")).toBe("settings");
    expect(switcherRoute([], "index", null)).toBeNull();
  });
});

describe("scrubIndex", () => {
  const rows = { top: 100, rowHeight: 48, count: 3 };

  it("maps a finger to the row under it", () => {
    expect(scrubIndex(100, rows)).toBe(0);
    expect(scrubIndex(147, rows)).toBe(0);
    expect(scrubIndex(148, rows)).toBe(1);
    expect(scrubIndex(243, rows)).toBe(2);
  });

  it("is null above or below the rows", () => {
    expect(scrubIndex(99, rows)).toBeNull();
    expect(scrubIndex(244, rows)).toBeNull();
    expect(scrubIndex(120, { ...rows, rowHeight: 0 })).toBeNull();
  });
});
