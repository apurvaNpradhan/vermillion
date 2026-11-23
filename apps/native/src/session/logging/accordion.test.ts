import { describe, expect, it } from "vitest";

import {
  afterChange,
  expandedForCell,
  expandedWith,
  expandedWithout,
  initialExpanded,
  toggled,
} from "./accordion";
import { blocksOf, type BlockExercise } from "./blocks";

const exercise = (id: string, group: string | null, ticks: readonly boolean[]): BlockExercise => ({
  id,
  supersetGroup: group,
  sets: ticks.map((done, index) => ({
    id: `${id}-${index + 1}`,
    completedAt: done ? "2026-01-01T10:00:00.000Z" : null,
  })),
});

const ids = (set: ReadonlySet<string>) => [...set].toSorted();

describe("initialExpanded", () => {
  it("opens only the first unfinished exercise", () => {
    const blocks = blocksOf([
      exercise("a", null, [true, true]),
      exercise("b", null, [true, false]),
      exercise("c", null, [false]),
    ]);
    expect(ids(initialExpanded(blocks))).toEqual(["b"]);
  });

  it("opens a whole superset block together", () => {
    const blocks = blocksOf([
      exercise("a", null, [true]),
      exercise("b", "g", [false]),
      exercise("c", "g", [false]),
      exercise("d", null, [false]),
    ]);
    expect(ids(initialExpanded(blocks))).toEqual(["b", "c"]);
  });

  it("opens nothing when everything is done", () => {
    expect(initialExpanded(blocksOf([exercise("a", null, [true])])).size).toBe(0);
  });
});

describe("expanded set helpers", () => {
  it("adds, removes and toggles without changing the set when nothing moves", () => {
    const open = new Set(["a"]);
    expect(expandedWith(open, ["a"])).toBe(open);
    expect(expandedWithout(open, ["b"])).toBe(open);
    expect(ids(expandedWith(open, ["b"]))).toEqual(["a", "b"]);
    expect(ids(toggled(open, "b"))).toEqual(["a", "b"]);
    expect(ids(toggled(open, "a"))).toEqual([]);
  });
});

describe("afterChange", () => {
  it("collapses a finished exercise and opens and reveals the next unfinished one", () => {
    const before = blocksOf([
      exercise("a", null, [true, false]),
      exercise("b", null, [false]),
      exercise("c", null, [false]),
    ]);
    const after = blocksOf([
      exercise("a", null, [true, true]),
      exercise("b", null, [false]),
      exercise("c", null, [false]),
    ]);
    const result = afterChange(before, after, new Set(["a"]));
    expect(ids(result.expanded)).toEqual(["b"]);
    expect(result.reveal).toBe("b");
  });

  it("keeps other exercises the user opened", () => {
    const before = blocksOf([exercise("a", null, [false]), exercise("b", null, [false])]);
    const after = blocksOf([exercise("a", null, [true]), exercise("b", null, [false])]);
    const result = afterChange(before, after, new Set(["a", "b"]));
    expect(ids(result.expanded)).toEqual(["b"]);
  });

  it("holds a superset open until every member is done, then moves on", () => {
    const start = [
      exercise("a", "g", [true, true]),
      exercise("b", "g", [true, false]),
      exercise("c", null, [false]),
    ];
    const before = blocksOf(start);
    const middle = blocksOf([start[0]!, exercise("b", "g", [true, false]), start[2]!]);
    expect(afterChange(before, middle, new Set(["a", "b"]))).toEqual({
      expanded: new Set(["a", "b"]),
      reveal: null,
    });
    const after = blocksOf([start[0]!, exercise("b", "g", [true, true]), start[2]!]);
    const result = afterChange(before, after, new Set(["a", "b"]));
    expect(ids(result.expanded)).toEqual(["c"]);
    expect(result.reveal).toBe("c");
  });

  it("wraps to an unfinished exercise before the finished one when none is left after it", () => {
    const before = blocksOf([exercise("a", null, [false]), exercise("b", null, [false])]);
    const after = blocksOf([exercise("a", null, [false]), exercise("b", null, [true])]);
    const result = afterChange(before, after, new Set(["b"]));
    expect(ids(result.expanded)).toEqual(["a"]);
    expect(result.reveal).toBe("a");
  });

  it("opens nothing when the last exercise is finished", () => {
    const before = blocksOf([exercise("a", null, [true]), exercise("b", null, [false])]);
    const after = blocksOf([exercise("a", null, [true]), exercise("b", null, [true])]);
    const result = afterChange(before, after, new Set(["b"]));
    expect(result.expanded.size).toBe(0);
    expect(result.reveal).toBeNull();
  });

  it("opens an exercise that was added and forgets one that was removed", () => {
    const before = blocksOf([exercise("a", null, [false]), exercise("b", null, [false])]);
    const after = blocksOf([exercise("a", null, [false]), exercise("c", null, [false])]);
    const result = afterChange(before, after, new Set(["a", "b"]));
    expect(ids(result.expanded)).toEqual(["a", "c"]);
    expect(result.reveal).toBeNull();
  });

  it("does not move when a done exercise is edited or nothing changed", () => {
    const blocks = blocksOf([exercise("a", null, [true]), exercise("b", null, [false])]);
    const open = new Set(["b"]);
    expect(afterChange(blocks, blocks, open).expanded).toBe(open);
  });
});

describe("expandedForCell", () => {
  it("opens the exercise of a cell the keypad targets", () => {
    const open: ReadonlySet<string> = new Set(["a"]);
    expect(ids(expandedForCell(open, "b"))).toEqual(["a", "b"]);
    expect(expandedForCell(open, "a")).toBe(open);
    expect(expandedForCell(open, undefined)).toBe(open);
  });
});
