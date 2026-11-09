import { describe, expect, it } from "vitest";

import { isPickable, selectionOrder, toggleSelection, withSelected } from "./pick-selection";

describe("pick selection", () => {
  it("returns ids in the order they were picked", () => {
    let selected: readonly string[] = [];
    for (const id of ["c", "a", "b"]) selected = toggleSelection(selected, id, {});
    expect(selected).toEqual(["c", "a", "b"]);
    expect([...selectionOrder(selected)]).toEqual([
      ["c", 1],
      ["a", 2],
      ["b", 3],
    ]);
  });

  it("removes a tapped selected id and renumbers the rest", () => {
    const selected = toggleSelection(["c", "a", "b"], "a", {});
    expect(selected).toEqual(["c", "b"]);
    expect(selectionOrder(selected).get("b")).toBe(2);
  });

  it("max 1 swaps the choice and still lets it be cleared", () => {
    expect(toggleSelection(["a"], "b", { max: 1 })).toEqual(["b"]);
    expect(toggleSelection(["b"], "b", { max: 1 })).toEqual([]);
  });

  it("ignores taps past a larger max but allows removing", () => {
    expect(toggleSelection(["a", "b"], "c", { max: 2 })).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "b", { max: 2 })).toEqual(["a"]);
  });

  it("never selects an excluded exercise", () => {
    const options = { exclude: ["x"] };
    expect(isPickable("x", options)).toBe(false);
    expect(isPickable("y", options)).toBe(true);
    expect(toggleSelection(["a"], "x", options)).toEqual(["a"]);
    expect(toggleSelection(["a"], "x", { ...options, max: 1 })).toEqual(["a"]);
  });

  it("withSelected adds a created exercise once, respecting max", () => {
    expect(withSelected(["a"], "n", {})).toEqual(["a", "n"]);
    expect(withSelected(["a", "n"], "n", {})).toEqual(["a", "n"]);
    expect(withSelected(["a"], "n", { max: 1 })).toEqual(["n"]);
  });
});
