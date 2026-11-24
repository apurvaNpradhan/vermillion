import { describe, expect, it } from "vitest";

import { initialExpanded, reconcileExpanded } from "./accordion";
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

describe("reconcileExpanded", () => {
  it("opens an added exercise and drops a removed exercise", () => {
    const before = blocksOf([exercise("a", null, [false]), exercise("b", null, [false])]);
    const after = blocksOf([exercise("a", null, [false]), exercise("c", null, [false])]);
    expect(ids(reconcileExpanded(before, after, new Set(["a", "b"])))).toEqual(["a", "c"]);
  });

  it("keeps a regrouped superset open when one member was already open", () => {
    const before = blocksOf([exercise("a", null, [false]), exercise("b", null, [false])]);
    const after = blocksOf([exercise("b", "g", [false]), exercise("a", "g", [false])]);
    expect(ids(reconcileExpanded(before, after, new Set(["a"])))).toEqual(["a", "b"]);
  });

  it("skips exercises without sets when opening the first unfinished block", () => {
    const blocks = blocksOf([exercise("a", null, []), exercise("b", null, [false])]);
    expect(ids(initialExpanded(blocks))).toEqual(["b"]);
  });
});
