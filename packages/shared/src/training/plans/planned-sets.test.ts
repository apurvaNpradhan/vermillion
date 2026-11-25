import { describe, expect, it } from "vitest";

import { raisedRange, raisedRepRange, type PlannedSet } from "./planned-sets";

const range = (kind: PlannedSet["kind"], min: number, max: number): PlannedSet => ({
  kind,
  reps_min: min,
  reps_max: max,
});

describe("raisedRange", () => {
  it("keeps the width and ends at the reps", () => {
    expect(raisedRange({ min: 8, max: 12 }, 15)).toEqual({ min: 11, max: 15 });
    expect(raisedRange({ min: 2, max: 12 }, 6)).toEqual({ min: 1, max: 6 });
  });
});

describe("raisedRepRange", () => {
  it("moves only progressing sets that have a range", () => {
    const sets: PlannedSet[] = [
      range("warmup", 8, 12),
      range("working", 8, 12),
      range("top", 8, 12),
      range("backoff", 8, 12),
      range("drop", 8, 12),
      range("myo", 8, 12),
      range("failure", 8, 12),
      range("working", 10, 10),
      { kind: "working" },
    ];
    expect(raisedRepRange(sets, 15)).toEqual([
      range("warmup", 8, 12),
      range("working", 11, 15),
      range("top", 11, 15),
      range("backoff", 11, 15),
      range("drop", 8, 12),
      range("myo", 8, 12),
      range("failure", 8, 12),
      range("working", 10, 10),
      { kind: "working" },
    ]);
  });

  it("moves only the sets that match the observed range", () => {
    const sets = [range("working", 8, 12), range("working", 10, 15), range("backoff", 8, 12)];
    expect(raisedRepRange(sets, 16, { min: 8, max: 12 })).toEqual([
      range("working", 12, 16),
      range("working", 10, 15),
      range("backoff", 12, 16),
    ]);
    expect(raisedRepRange(sets, 16, { min: 6, max: 10 })).toBeNull();
  });

  it("leaves ranges that already reach the reps, and says so with null", () => {
    expect(raisedRepRange([range("working", 8, 12)], 12)).toBeNull();
    expect(raisedRepRange([range("working", 8, 12)], 10)).toBeNull();
    expect(raisedRepRange([], 12)).toBeNull();
  });
});
