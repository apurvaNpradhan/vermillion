import { describe, expect, it } from "vitest";

import { customExerciseInput } from "./custom-exercise";
import {
  EQUIPMENT_KEYS,
  EXERCISE_TYPE_KEYS,
  MUSCLE_GROUP_KEYS,
  MUSCLE_REGION_KEYS,
} from "./labels";
import { searchTokens } from "./search";
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  MUSCLE_REGION,
  MUSCLE_REGIONS,
  SET_FIELDS,
  SET_FIELD_NAMES,
} from "./vocabulary";

describe("vocabulary", () => {
  it("has the agreed sizes", () => {
    expect(MUSCLE_GROUPS).toHaveLength(20);
    expect(EQUIPMENT).toHaveLength(9);
    expect(EXERCISE_TYPES).toHaveLength(9);
  });

  it("covers every slug with a region, a label key and (types) set fields", () => {
    expect(Object.keys(MUSCLE_REGION).toSorted()).toEqual([...MUSCLE_GROUPS].toSorted());
    expect(Object.keys(MUSCLE_GROUP_KEYS).toSorted()).toEqual([...MUSCLE_GROUPS].toSorted());
    expect(Object.keys(EQUIPMENT_KEYS).toSorted()).toEqual([...EQUIPMENT].toSorted());
    expect(Object.keys(EXERCISE_TYPE_KEYS).toSorted()).toEqual([...EXERCISE_TYPES].toSorted());
    expect(Object.keys(SET_FIELDS).toSorted()).toEqual([...EXERCISE_TYPES].toSorted());
    expect(Object.keys(MUSCLE_REGION_KEYS).toSorted()).toEqual([...MUSCLE_REGIONS].toSorted());
    for (const group of MUSCLE_GROUPS) expect(MUSCLE_REGIONS).toContain(MUSCLE_REGION[group]);
  });

  it("gives every exercise type at least one known set field", () => {
    for (const type of EXERCISE_TYPES) {
      expect(SET_FIELDS[type].length).toBeGreaterThan(0);
      for (const field of SET_FIELDS[type]) expect(SET_FIELD_NAMES).toContain(field);
    }
  });

  it("uses every set field for some type", () => {
    const used = new Set(EXERCISE_TYPES.flatMap((type) => SET_FIELDS[type]));
    expect([...used].toSorted()).toEqual([...SET_FIELD_NAMES].toSorted());
  });
});

describe("searchTokens", () => {
  it("lowercases, trims, splits on whitespace and drops empties", () => {
    expect(searchTokens("  Bench   PRESS\t barbell\n")).toEqual(["bench", "press", "barbell"]);
    expect(searchTokens("   ")).toEqual([]);
    expect(searchTokens("")).toEqual([]);
  });

  it("escapes LIKE wildcards and the escape character", () => {
    expect(searchTokens("100% a_b c\\d")).toEqual(["100\\%", "a\\_b", "c\\\\d"]);
  });
});

describe("customExerciseInput", () => {
  const valid = {
    title: "  My press ",
    primary_muscle: "chest",
    secondary_muscles: ["triceps", "shoulders"],
    equipment: "dumbbell",
    exercise_type: "weight_reps",
    is_full_bodyweight: false,
    instructions: null,
  } as const;

  it("accepts a valid exercise and trims the title", () => {
    expect(customExerciseInput.parse(valid).title).toBe("My press");
    expect(
      customExerciseInput.safeParse({ ...valid, instructions: "x".repeat(2000) }).success,
    ).toBe(true);
  });

  it("enforces the caps", () => {
    expect(customExerciseInput.safeParse({ ...valid, title: "   " }).success).toBe(false);
    expect(customExerciseInput.safeParse({ ...valid, title: "a".repeat(101) }).success).toBe(false);
    expect(
      customExerciseInput.safeParse({ ...valid, instructions: "x".repeat(2001) }).success,
    ).toBe(false);
  });

  it("rejects unknown slugs and unknown fields", () => {
    expect(customExerciseInput.safeParse({ ...valid, equipment: "cable" }).success).toBe(false);
    expect(customExerciseInput.safeParse({ ...valid, rank: 5 }).success).toBe(false);
  });

  it("requires unique secondary muscles that exclude the primary", () => {
    expect(
      customExerciseInput.safeParse({ ...valid, secondary_muscles: ["triceps", "triceps"] })
        .success,
    ).toBe(false);
    expect(customExerciseInput.safeParse({ ...valid, secondary_muscles: ["chest"] }).success).toBe(
      false,
    );
  });
});
