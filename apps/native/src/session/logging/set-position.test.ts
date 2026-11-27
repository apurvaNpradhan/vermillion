import { describe, expect, it } from "vitest";

import { workingPosition } from "./set-position";

describe("workingPosition", () => {
  const kinds = ["warmup", "warmup", "working", "working", "drop", "working"] as const;

  it("numbers working sets as the row shows them, skipping warm-ups and other kinds", () => {
    expect(workingPosition(kinds, 2)).toEqual({ number: 1, total: 3 });
    expect(workingPosition(kinds, 3)).toEqual({ number: 2, total: 3 });
    expect(workingPosition(kinds, 5)).toEqual({ number: 3, total: 3 });
  });

  it("has no number for a set that shows a letter", () => {
    expect(workingPosition(kinds, 0)).toBeNull();
    expect(workingPosition(kinds, 4)).toBeNull();
  });

  it("has no number for an index outside the sets", () => {
    expect(workingPosition(kinds, 9)).toBeNull();
  });
});
