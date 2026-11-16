import { describe, expect, it } from "vitest";

import { repeatCounts, rotationSummary } from "./rotation";

const slot = (id: string, workoutId: string | null) => ({ id, workoutId });

describe("rotationSummary", () => {
  it("counts training days and the rotation length", () => {
    const slots = [slot("1", "push"), slot("2", "pull"), slot("3", "legs"), slot("4", null)];
    expect(rotationSummary(slots)).toEqual({
      trainingDays: 3,
      restDays: 1,
      rotationDays: 4,
      showRotation: true,
    });
  });

  it("counts a repeated Workout once per Slot and Rest Slots as rest", () => {
    const slots = [
      slot("1", "upper"),
      slot("2", "lower"),
      slot("3", null),
      slot("4", "upper"),
      slot("5", "lower"),
      slot("6", null),
    ];
    expect(rotationSummary(slots)).toMatchObject({
      trainingDays: 4,
      restDays: 2,
      rotationDays: 6,
    });
  });

  it("does not repeat itself when there is no rest", () => {
    expect(rotationSummary([slot("1", "a"), slot("2", "b")]).showRotation).toBe(false);
  });

  it("is all zeros for an empty Rotation", () => {
    expect(rotationSummary([])).toEqual({
      trainingDays: 0,
      restDays: 0,
      rotationDays: 0,
      showRotation: false,
    });
  });
});

describe("repeatCounts", () => {
  it("lists only Workouts that fill more than one Slot", () => {
    const slots = [slot("1", "upper"), slot("2", "lower"), slot("3", null), slot("4", "upper")];
    expect(repeatCounts(slots)).toEqual(new Map([["upper", 2]]));
    expect(repeatCounts([])).toEqual(new Map());
  });
});
