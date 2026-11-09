import { EXERCISE_TYPES } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { MORE_TYPES, PLAIN_TYPE_CHOICES, typeChoice } from "./type-choices";

describe("type choices", () => {
  it("offers four plain choices and five more types that together cover all nine", () => {
    expect(PLAIN_TYPE_CHOICES.map((choice) => choice.type)).toEqual([
      "weight_reps",
      "reps_only",
      "duration",
      "distance_duration",
    ]);
    expect(MORE_TYPES).toEqual([
      "bodyweight_reps",
      "bodyweight_assisted_reps",
      "short_distance_weight",
      "floors_duration",
      "steps_duration",
    ]);
    expect(new Set([...PLAIN_TYPE_CHOICES.map((choice) => choice.type), ...MORE_TYPES])).toEqual(
      new Set(EXERCISE_TYPES),
    );
  });

  it("maps every type to exactly one choice", () => {
    for (const type of EXERCISE_TYPES) {
      const choice = typeChoice(type);
      expect(choice === "more" ? MORE_TYPES.includes(type) : choice === type).toBe(true);
    }
    expect(typeChoice("weight_reps")).toBe("weight_reps");
    expect(typeChoice("steps_duration")).toBe("more");
  });
});
