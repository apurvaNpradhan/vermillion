import { describe, expect, it } from "vitest";

import { recordMessage } from "./record-message";

describe("record message", () => {
  it("names the weight and reps in the person's unit", () => {
    expect(recordMessage("Bench press", { weightKg: 102.5, reps: 5 }, "kg")).toEqual({
      kind: "weight-reps",
      exercise: "Bench press",
      weight: "102.5",
      unit: "kg",
      reps: 5,
    });
    expect(recordMessage("Bench press", { weightKg: 100, reps: 5 }, "lb")).toMatchObject({
      weight: "220.5",
      unit: "lb",
    });
  });

  it("falls back to reps alone, then to the exercise", () => {
    expect(recordMessage("Pull-up", { reps: 12 }, "kg")).toEqual({
      kind: "reps",
      exercise: "Pull-up",
      reps: 12,
    });
    expect(recordMessage("Plank", { weightKg: null, reps: null }, "kg").kind).toBe("plain");
  });
});
