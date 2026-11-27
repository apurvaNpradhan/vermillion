import { describe, expect, it } from "vitest";

import { homeDayState, slotLabel, stripState } from "./strip-state";

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

describe("home day state", () => {
  const week = { trained: new Set([10, 11]), planned: 13 };

  it("uses the same marks as the cycle strip", () => {
    expect(homeDayState(10, week)).toBe("done");
    expect(homeDayState(13, week)).toBe("next");
  });

  it("leaves other days unmarked", () => {
    expect(homeDayState(12, week)).toBeNull();
    expect(homeDayState(14, { ...week, planned: null })).toBeNull();
  });

  it("shows a trained day as done even when it is also the planned day", () => {
    expect(homeDayState(11, { trained: new Set([11]), planned: 11 })).toBe("done");
  });
});

describe("slot label", () => {
  const t = (
    key: "run__slot_state" | "run__slot_rest",
    values: { [name: string]: string | number },
  ) =>
    key === "run__slot_rest"
      ? `Day ${values.day}, rest day`
      : `Day ${values.day}, ${values.title}, ${values.state}`;

  it("names a rest day once", () => {
    expect(slotLabel(t, { day: 3, state: "rest", title: "Rest day" }, "Rest day")).toBe(
      "Day 3, rest day",
    );
  });

  it("names a workout day with its state", () => {
    expect(slotLabel(t, { day: 1, state: "next", title: "Upper A" }, "Up next")).toBe(
      "Day 1, Upper A, Up next",
    );
  });
});
