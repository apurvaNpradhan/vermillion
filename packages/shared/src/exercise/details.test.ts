import { describe, expect, it } from "vitest";

import { catalogExerciseInput } from "./catalog";
import { customExerciseFields, customExerciseInput } from "./custom-exercise";
import { MUSCLE_DETAIL_KEYS } from "./labels";
import {
  detailsOf,
  groupOf,
  hasValidDetails,
  isMuscleDetail,
  MUSCLE_DETAIL_ALIASES,
  MUSCLE_DETAIL_SLUGS,
  MUSCLE_DETAILS,
  MUSCLE_GROUPS,
} from "./vocabulary";

// Groups the body map has no drawing for (apps/native/src/body-map/core/groups.ts).
const UNDRAWN: readonly string[] = ["cardio", "full_body", "other"];

describe("muscle details", () => {
  it("has the 23 details of ADR 0050, each inside a real, drawable group", () => {
    expect(Object.keys(MUSCLE_DETAILS)).toHaveLength(23);
    expect([...MUSCLE_DETAIL_SLUGS].toSorted()).toEqual(Object.keys(MUSCLE_DETAILS).toSorted());
    for (const detail of MUSCLE_DETAIL_SLUGS) {
      expect(MUSCLE_GROUPS).toContain(groupOf(detail));
      expect(UNDRAWN).not.toContain(groupOf(detail));
    }
  });

  it("lists a group's details in the ADR's order", () => {
    expect(detailsOf("shoulders")).toEqual([
      "front_delts",
      "side_delts",
      "rear_delts",
      "rotator_cuff",
    ]);
    expect(detailsOf("chest")).toEqual(["upper_chest", "lower_chest"]);
    expect(detailsOf("lats")).toEqual([]);
    expect(groupOf("hip_flexors")).toBe("quadriceps");
  });

  it("has a label key and search aliases for every detail", () => {
    for (const detail of MUSCLE_DETAIL_SLUGS) {
      expect(MUSCLE_DETAIL_KEYS[detail]).toBe(`exercise__detail_${detail}`);
      const aliases: readonly string[] = MUSCLE_DETAIL_ALIASES[detail];
      expect(aliases.length).toBeGreaterThan(0);
      for (const alias of aliases) expect(alias).toBe(alias.toLowerCase());
    }
    expect(MUSCLE_DETAIL_ALIASES.rear_delts).toContain("posterior delt");
    expect(MUSCLE_DETAIL_ALIASES.hip_flexors).toContain("iliopsoas");
  });

  it("has at least the words of its label among its aliases", () => {
    for (const detail of MUSCLE_DETAIL_SLUGS) {
      const aliasText = MUSCLE_DETAIL_ALIASES[detail].join(" ");
      // The slug's words are the label's words; a plural matches through its stem.
      for (const word of detail.split("_")) expect(aliasText).toContain(word.replace(/s$/u, ""));
    }
  });

  it("recognises known slugs only", () => {
    expect(isMuscleDetail("side_delts")).toBe(true);
    expect(isMuscleDetail("wings")).toBe(false);
  });
});

describe("hasValidDetails", () => {
  const base = {
    primary_muscle: "shoulders",
    secondary_muscles: ["chest", "triceps"],
    primary_detail: ["side_delts"],
    secondary_detail: ["upper_chest"],
  } as const;

  it("accepts details in the right groups, and none at all", () => {
    expect(hasValidDetails(base)).toBe(true);
    expect(hasValidDetails({ ...base, primary_detail: [], secondary_detail: [] })).toBe(true);
  });

  it("refuses a primary detail outside the primary group", () => {
    expect(hasValidDetails({ ...base, primary_detail: ["upper_chest"] })).toBe(false);
  });

  it("refuses a secondary detail whose group is not a secondary muscle", () => {
    expect(hasValidDetails({ ...base, secondary_detail: ["biceps_brachii"] })).toBe(false);
    // The primary group is not a secondary one either.
    expect(hasValidDetails({ ...base, secondary_detail: ["rear_delts"] })).toBe(false);
  });

  it("refuses repeats, a detail in both lists and unknown slugs", () => {
    expect(hasValidDetails({ ...base, primary_detail: ["side_delts", "side_delts"] })).toBe(false);
    expect(
      hasValidDetails({
        ...base,
        secondary_muscles: ["shoulders", "chest"] as never,
        secondary_detail: ["side_delts"],
      }),
    ).toBe(false);
    expect(hasValidDetails({ ...base, primary_detail: ["wings"] as never })).toBe(false);
  });
});

describe("the detail fields of the input schemas", () => {
  const custom = {
    title: "Cable lateral raise",
    primary_muscle: "shoulders",
    secondary_muscles: ["chest"],
    equipment: "cable",
    exercise_type: "weight_reps",
    is_full_bodyweight: false,
    instructions: null,
  } as const;

  it("defaults a Custom exercise's details to none", () => {
    const parsed = customExerciseInput.parse(custom);
    expect(parsed.primary_detail).toEqual([]);
    expect(parsed.secondary_detail).toEqual([]);
  });

  it("validates a Custom exercise's details", () => {
    expect(
      customExerciseInput.safeParse({ ...custom, primary_detail: ["side_delts"] }).success,
    ).toBe(true);
    expect(
      customExerciseInput.safeParse({ ...custom, primary_detail: ["upper_chest"] }).success,
    ).toBe(false);
    expect(customExerciseInput.safeParse({ ...custom, primary_detail: ["wings"] }).success).toBe(
      false,
    );
  });

  it("applies the same rule to the admin's catalog input", () => {
    const catalog = {
      title: "Cable lateral raise",
      primaryMuscle: "shoulders",
      secondaryMuscles: [],
      equipment: "cable",
      exerciseType: "weight_reps",
      isFullBodyweight: false,
      aka: null,
      searchTerms: null,
      instructions: null,
      rank: 0,
    } as const;
    expect(catalogExerciseInput.parse(catalog).primaryDetail).toEqual([]);
    expect(
      catalogExerciseInput.safeParse({ ...catalog, primaryDetail: ["side_delts"] }).success,
    ).toBe(true);
    expect(
      catalogExerciseInput.safeParse({ ...catalog, primaryDetail: ["obliques"] }).success,
    ).toBe(false);
  });

  it("does not default the details of a partial patch to empty", () => {
    expect(customExerciseFields.partial().parse({})).toEqual({});
  });
});
