import { describe, expect, it } from "vitest";

import { scrubIndex, tabSlots } from "./tab-slots";

describe("tabSlots", () => {
  it("puts the first two routes on the pill by default and the rest in the menu", () => {
    expect(tabSlots(["index", "exercises", "settings"])).toEqual({
      direct: ["index", "exercises"],
      overflow: ["settings"],
    });
  });

  it("puts only the first route on the pill when the app asks for one direct tab", () => {
    expect(tabSlots(["index", "exercises", "settings"], 1)).toEqual({
      direct: ["index"],
      overflow: ["exercises", "settings"],
    });
  });

  it("can leave the pill with the menu button alone, and never goes below zero", () => {
    expect(tabSlots(["a", "b"], 0)).toEqual({ direct: [], overflow: ["a", "b"] });
    expect(tabSlots(["a", "b"], -3)).toEqual({ direct: [], overflow: ["a", "b"] });
  });

  it("leaves the menu empty when every route fits on the pill", () => {
    expect(tabSlots(["index"])).toEqual({ direct: ["index"], overflow: [] });
  });

  it("drops routes past five, whatever the direct count", () => {
    expect(tabSlots(["a", "b", "c", "d", "e", "f"], 1).overflow).toEqual(["b", "c", "d", "e"]);
  });

  it("drops routes past five", () => {
    expect(tabSlots(["a", "b", "c", "d", "e", "f"]).overflow).toEqual(["c", "d", "e"]);
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
