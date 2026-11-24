import { describe, expect, it } from "vitest";

import { stripState } from "./strip-state";

const progress = {
  trained: new Set(["a", "b"]),
  skipped: new Set(["b"]),
  next: { id: "c" },
};

describe("cycle strip state", () => {
  it("tells done, skipped, next, to do and rest apart", () => {
    expect(stripState({ id: "a", workoutId: "w" }, progress)).toBe("done");
    expect(stripState({ id: "b", workoutId: "w" }, progress)).toBe("skipped");
    expect(stripState({ id: "c", workoutId: "w" }, progress)).toBe("next");
    expect(stripState({ id: "d", workoutId: "w" }, progress)).toBe("todo");
    expect(stripState({ id: "r", workoutId: null }, progress)).toBe("rest");
  });

  it("has no next when the cycle is complete", () => {
    expect(stripState({ id: "d", workoutId: "w" }, { ...progress, next: null })).toBe("todo");
  });
});
