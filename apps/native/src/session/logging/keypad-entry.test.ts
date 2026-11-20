import { describe, expect, it } from "vitest";

import type { EntryField } from "@/platform/ui/keypad-entry";

import { blocksOf } from "./blocks";
import { cellOrder, nextCell } from "./keypad-entry";

describe("Next", () => {
  const exercise = (id: string, group: string | null, kinds: ("warmup" | "working")[]) => ({
    id,
    supersetGroup: group,
    sets: kinds.map((kind, index) => ({ id: `${id}${index + 1}`, completedAt: null, kind })),
  });
  const order = (
    exercises: ReturnType<typeof exercise>[],
    fields: EntryField[] = ["weight", "reps"],
  ) => {
    const [block] = blocksOf(exercises);
    return block ? cellOrder(block, () => fields) : [];
  };
  const names = (cells: { setId: string; field: string }[]) =>
    cells.map((cell) => `${cell.setId}:${cell.field}`);

  it("walks weight, reps, then the next set's weight, and stops at the end", () => {
    const cells = order([exercise("a", null, ["working", "working"])]);
    expect(names(cells)).toEqual(["a1:weight", "a1:reps", "a2:weight", "a2:reps"]);
    expect(nextCell(cells, { setId: "a1", field: "weight" })).toEqual({
      setId: "a1",
      field: "reps",
    });
    expect(nextCell(cells, { setId: "a1", field: "reps" })).toEqual({
      setId: "a2",
      field: "weight",
    });
    expect(nextCell(cells, { setId: "a2", field: "reps" })).toBeNull();
    expect(nextCell(cells, { setId: "zz", field: "reps" })).toBeNull();
  });

  it("follows the rounds of a superset", () => {
    const cells = order(
      [exercise("a", "g", ["working", "working"]), exercise("b", "g", ["working"])],
      ["reps"],
    );
    expect(names(cells)).toEqual(["a1:reps", "b1:reps", "a2:reps"]);
  });

  it("goes A warm-ups, A work, B work when only A has warm-ups", () => {
    const cells = order(
      [exercise("a", "g", ["warmup", "warmup", "working"]), exercise("b", "g", ["working"])],
      ["reps"],
    );
    expect(names(cells)).toEqual(["a1:reps", "a2:reps", "a3:reps", "b1:reps"]);
  });
});
