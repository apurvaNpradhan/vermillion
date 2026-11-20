import { describe, expect, it } from "vitest";

import {
  blockOf,
  blocksOf,
  firstUnfinished,
  highlightOf,
  isBlockDone,
  nextAfter,
  nextSupersetExercise,
  type BlockExercise,
} from "./blocks";

const exercise = (id: string, group: string | null, ticks: readonly boolean[]): BlockExercise => ({
  id,
  supersetGroup: group,
  sets: ticks.map((done, index) => ({
    id: `${id}-${index + 1}`,
    completedAt: done ? "2026-01-01T10:00:00.000Z" : null,
  })),
});

describe("blocksOf", () => {
  it("makes a block of each lone exercise and one of each superset run", () => {
    const list = [
      exercise("a", null, [false]),
      exercise("b", "g", [false]),
      exercise("c", "g", [false]),
      exercise("d", null, [false]),
      exercise("e", "h", [false]),
    ];
    const blocks = blocksOf(list);
    expect(
      blocks.map((block) => [block.id, block.members.map((member) => member.id), block.superset]),
    ).toEqual([
      ["a", ["a"], false],
      ["b", ["b", "c"], true],
      ["d", ["d"], false],
      // A group of one is no group.
      ["e", ["e"], false],
    ]);
    expect(blockOf(blocks, "c")?.id).toBe("b");
    expect(blockOf(blocks, "zzz")).toBeUndefined();
  });

  it("splits a group whose members are no longer next to each other", () => {
    const blocks = blocksOf([
      exercise("a", "g", [false]),
      exercise("x", null, [false]),
      exercise("b", "g", [false]),
    ]);
    expect(blocks.map((block) => block.members.length)).toEqual([1, 1, 1]);
  });
});

describe("progress", () => {
  const list = [
    exercise("a", null, [true, true]),
    exercise("b", "g", [true, false]),
    exercise("c", "g", [true, true]),
    exercise("d", null, [false]),
  ];

  it("finds the first unfinished block and when a block is done", () => {
    const blocks = blocksOf(list);
    expect(blocks.map(isBlockDone)).toEqual([true, false, false]);
    expect(firstUnfinished(blocks)?.id).toBe("b");
    expect(firstUnfinished(blocks.slice(0, 1))).toBeNull();
    expect(isBlockDone({ id: "z", members: [exercise("z", null, [])], superset: false })).toBe(
      true,
    );
  });

  it("advances to the next unfinished block, wrapping back to an earlier one", () => {
    const blocks = blocksOf(list);
    expect(nextAfter(blocks, "a")?.id).toBe("b");
    expect(nextAfter(blocks, "b")?.id).toBe("d");
    expect(nextAfter(blocks, "d")?.id).toBe("b");
    const done = blocksOf([exercise("a", null, [true]), exercise("b", null, [true])]);
    expect(nextAfter(done, "a")).toBeNull();
  });
});

describe("highlightOf", () => {
  it("is the first unticked set of a lone exercise", () => {
    const [block] = blocksOf([exercise("a", null, [true, false, false])]);
    expect(block && highlightOf(block)).toEqual({ exerciseId: "a", setId: "a-2" });
    const [done] = blocksOf([exercise("a", null, [true])]);
    expect(done && highlightOf(done)).toBeNull();
  });

  it("alternates between members of a superset by rounds", () => {
    const sets = (a: boolean[], b: boolean[]) => {
      const [block] = blocksOf([exercise("a", "g", a), exercise("b", "g", b)]);
      return block ? highlightOf(block) : null;
    };
    expect(sets([false, false], [false, false])).toEqual({ exerciseId: "a", setId: "a-1" });
    expect(sets([true, false], [false, false])).toEqual({ exerciseId: "b", setId: "b-1" });
    expect(sets([true, false], [true, false])).toEqual({ exerciseId: "a", setId: "a-2" });
    expect(sets([true, true], [true, false])).toEqual({ exerciseId: "b", setId: "b-2" });
    expect(sets([true, true], [true, true])).toBeNull();
  });

  it("lets a member with fewer sets sit out the later rounds, and picks up skipped sets", () => {
    const [block] = blocksOf([exercise("a", "g", [true, true, false]), exercise("b", "g", [true])]);
    expect(block && highlightOf(block)).toEqual({ exerciseId: "a", setId: "a-3" });
    const [skipped] = blocksOf([
      exercise("a", "g", [false, true]),
      exercise("b", "g", [true, true]),
    ]);
    expect(skipped && highlightOf(skipped)).toEqual({ exerciseId: "a", setId: "a-1" });
  });
});

describe("nextSupersetExercise", () => {
  const block = (list: BlockExercise[]) => {
    const found = blocksOf(list)[0];
    if (!found) throw new Error("no block");
    return found;
  };
  it("goes to the next member with an open set, wrapping round", () => {
    const ab = block([exercise("a", "g", [true, false]), exercise("b", "g", [false, false])]);
    expect(nextSupersetExercise(ab, "a-1")?.id).toBe("b");
    expect(nextSupersetExercise(ab, "b-1")?.id).toBe("a");
  });
  it("skips members that are done and returns null when the others are all done", () => {
    const abc = block([
      exercise("a", "g", [false]),
      exercise("b", "g", [true]),
      exercise("c", "g", [false]),
    ]);
    expect(nextSupersetExercise(abc, "a-1")?.id).toBe("c");
    const done = block([exercise("a", "g", [true, false]), exercise("b", "g", [true, true])]);
    expect(nextSupersetExercise(done, "a-1")).toBeNull();
  });
  it("is null for a lone exercise or an unknown set", () => {
    const lone = block([exercise("a", null, [false, false])]);
    expect(nextSupersetExercise(lone, "a-1")).toBeNull();
    const ab = block([exercise("a", "g", [false]), exercise("b", "g", [false])]);
    expect(nextSupersetExercise(ab, "zzz")).toBeNull();
  });
});
