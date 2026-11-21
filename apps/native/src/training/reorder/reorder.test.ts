import { describe, expect, it } from "vitest";

import { autoScrollSpeed, indexFromPosition, previewMove, reconcileOrder } from "./reorder";

const rows = [
  { id: "a", superset_group: "group", rest_seconds: null },
  { id: "b", superset_group: "group", rest_seconds: 90 },
  { id: "c", superset_group: null, rest_seconds: 60 },
];

describe("the reorder preview", () => {
  it("keeps the move while the local watcher still reports the same list", () => {
    const move = previewMove(rows, "c", 1);
    expect(move).toEqual({
      beforeId: "b",
      rows: [rows[0], { id: "c", superset_group: "group", rest_seconds: null }, rows[1]],
    });
    if (!move) throw new Error("Expected a move");
    const preview = { base: rows, rows: move.rows };
    expect(
      reconcileOrder(
        rows.map((row) => ({ ...row })),
        preview,
      ),
    ).toBe(move.rows);
    expect(reconcileOrder(rows, null)).toBe(rows);
  });

  it("adopts a new order, membership, or grouping from the watcher", () => {
    const move = previewMove(rows, "c", 1);
    if (!move) throw new Error("Expected a move");
    const preview = { base: rows, rows: move.rows };
    const reordered = rows.toReversed();
    const removed = rows.slice(1);
    const regrouped = rows.map((row) => ({ ...row, superset_group: null }));
    expect(reconcileOrder(reordered, preview)).toBe(reordered);
    expect(reconcileOrder(removed, preview)).toBe(removed);
    expect(reconcileOrder(regrouped, preview)).toBe(regrouped);
    expect(reconcileOrder(move.rows, preview)).toBe(move.rows);
  });

  it("repairs the remaining superset when a member is moved out", () => {
    expect(previewMove(rows, "a", 2)).toEqual({
      beforeId: null,
      rows: [
        { id: "b", superset_group: null, rest_seconds: 90 },
        rows[2],
        { id: "a", superset_group: null, rest_seconds: 90 },
      ],
    });
  });

  it("ignores unchanged, missing, and out-of-range moves", () => {
    expect(previewMove(rows, "a", 0)).toBeNull();
    expect(previewMove(rows, "missing", 1)).toBeNull();
    expect(previewMove(rows, "a", -1)).toBeNull();
    expect(previewMove(rows, "c", rows.length)).toBeNull();
  });
});

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
