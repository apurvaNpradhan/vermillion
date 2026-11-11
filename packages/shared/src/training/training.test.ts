import { describe, expect, it } from "vitest";

import { EXERCISE_TYPES } from "../exercise/vocabulary";
import { derivedTitleMuscles, derivedWorkoutTitle, formatWeight, parseWeight } from "./format";
import { workoutExerciseInput, programInput, programSlotInput, workoutInput } from "./inputs";
import { defaultPlannedSets, plannedSetKeys, plannedSetsSchema } from "./planned-sets";
import {
  defaultRestSeconds,
  EFFORT_STEPS,
  REST_FLOORS,
  rirToRpe,
  rpeToRir,
  SET_KINDS,
} from "./vocabulary";

describe("effort", () => {
  it("has halves from 6 to 10", () => {
    expect(EFFORT_STEPS).toEqual([6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]);
    expect(SET_KINDS).toEqual(["warmup", "working", "drop", "failure", "top", "backoff", "myo"]);
  });
  it("converts RPE and RIR both ways", () => {
    expect(rpeToRir(8)).toBe(2);
    expect(rpeToRir(9.5)).toBe(0.5);
    expect(rirToRpe(0)).toBe(10);
    for (const step of EFFORT_STEPS) expect(rirToRpe(rpeToRir(step))).toBe(step);
  });
});

describe("plannedSetsSchema", () => {
  const working = { kind: "working" } as const;
  const accepts = {
    weight_reps: { reps_min: 8, reps_max: 10, weight_kg: 60, effort_min: 8, effort_max: 9 },
    reps_only: { reps_min: 5, reps_max: 5, effort_min: 7, effort_max: 7 },
    bodyweight_reps: { reps_min: 10, reps_max: 15 },
    bodyweight_assisted_reps: { reps_min: 6, reps_max: 8, weight_kg: 20 },
    duration: { duration_s: 60 },
    distance_duration: { distance_m: 5000, duration_s: 1800 },
    short_distance_weight: { weight_kg: 100, distance_m: 20 },
    floors_duration: { floors: 20, duration_s: 600 },
    steps_duration: { steps: 3000, duration_s: 900 },
  } as const;

  it.each(["top", "backoff", "myo"] as const)("accepts %s with effort targets", (kind) => {
    expect(
      plannedSetsSchema("weight_reps").parse([
        { kind, reps_min: 5, reps_max: 8, effort_min: 8, effort_max: 9 },
      ])[0]?.kind,
    ).toBe(kind);
  });

  it("accepts the fields each exercise type records and refuses every other field", () => {
    const groups = [
      { reps_min: 8, reps_max: 10 },
      { weight_kg: 60 },
      { effort_min: 8, effort_max: 9 },
      { duration_s: 60 },
      { distance_m: 100 },
      { floors: 5 },
      { steps: 100 },
    ] as const;
    for (const type of EXERCISE_TYPES) {
      const schema = plannedSetsSchema(type);
      expect(schema.safeParse([{ ...working, ...accepts[type] }]).success, type).toBe(true);
      const recorded = plannedSetKeys(type);
      for (const group of groups) {
        const [key] = Object.keys(group);
        const result = schema.safeParse([{ ...working, ...group }]);
        expect(result.success, `${type} ${key}`).toBe(recorded.some((k) => k === key));
      }
    }
    expect(plannedSetKeys("duration")).toEqual(["duration_s"]);
  });

  it("refuses effort and reps on types without reps, and weight on duration", () => {
    expect(
      plannedSetsSchema("duration").safeParse([{ ...working, effort_min: 8, effort_max: 8 }])
        .success,
    ).toBe(false);
    expect(
      plannedSetsSchema("duration").safeParse([{ ...working, reps_min: 1, reps_max: 1 }]).success,
    ).toBe(false);
    expect(plannedSetsSchema("duration").safeParse([{ ...working, weight_kg: 5 }]).success).toBe(
      false,
    );
    expect(
      plannedSetsSchema("weight_reps").safeParse([{ ...working, duration_s: 5 }]).success,
    ).toBe(false);
  });

  it("refuses unknown keys, bad ranges, bad effort values and more than 20 sets", () => {
    const schema = plannedSetsSchema("weight_reps");
    expect(schema.safeParse([{ ...working, colour: "red" }]).success).toBe(false);
    expect(schema.safeParse([{ ...working, reps_min: 10, reps_max: 8 }]).success).toBe(false);
    expect(schema.safeParse([{ ...working, reps_min: 8 }]).success).toBe(false);
    expect(schema.safeParse([{ ...working, weight_kg: -1 }]).success).toBe(false);
    expect(schema.safeParse([{ ...working, effort_min: 8.25, effort_max: 9 }]).success).toBe(false);
    expect(schema.safeParse([{ ...working, effort_min: 9, effort_max: 8 }]).success).toBe(false);
    expect(schema.safeParse([{ ...working, effort_min: 5, effort_max: 8 }]).success).toBe(false);
    expect(schema.safeParse([{ kind: "pyramid" }]).success).toBe(false);
    expect(schema.safeParse(Array.from({ length: 20 }, () => working)).success).toBe(true);
    expect(schema.safeParse(Array.from({ length: 21 }, () => working)).success).toBe(false);
  });
});

describe("defaults", () => {
  it("gives 3 working sets that their own type accepts", () => {
    for (const type of EXERCISE_TYPES) {
      const sets = defaultPlannedSets(type);
      expect(sets).toHaveLength(3);
      expect(sets.every((set) => set.kind === "working")).toBe(true);
      expect(plannedSetsSchema(type).safeParse(sets).success, type).toBe(true);
    }
    expect(defaultPlannedSets("weight_reps")[0]).toEqual({
      kind: "working",
      reps_min: 8,
      reps_max: 12,
    });
    expect(defaultPlannedSets("duration")[0]).toEqual({ kind: "working", duration_s: 30 });
    expect(defaultPlannedSets("distance_duration")[0]).toEqual({
      kind: "working",
      duration_s: 30,
    });
    expect(defaultPlannedSets("short_distance_weight")[0]).toEqual({ kind: "working" });
  });
  it("returns fresh sets each time", () => {
    expect(defaultPlannedSets("reps_only")[0]).not.toBe(defaultPlannedSets("reps_only")[0]);
  });

  it("raises rest to the floor of barbell compound lifts only", () => {
    expect(REST_FLOORS).toEqual([
      { exerciseType: "weight_reps", equipment: "barbell", compound: true, seconds: 180 },
    ]);
    const squat = { equipment: "barbell", secondaryMuscles: ["glutes"] } as const;
    expect(defaultRestSeconds("weight_reps", 120, squat)).toBe(180);
    expect(defaultRestSeconds("weight_reps", 240, squat)).toBe(240);
    expect(defaultRestSeconds("weight_reps", 700, squat)).toBe(600);
    const curl = { equipment: "barbell", secondaryMuscles: [] } as const;
    expect(defaultRestSeconds("weight_reps", 120, curl)).toBe(120);
    expect(
      defaultRestSeconds("weight_reps", 120, {
        equipment: "dumbbell",
        secondaryMuscles: ["glutes"],
      }),
    ).toBe(120);
    expect(defaultRestSeconds("weight_reps", 120)).toBe(120);
    expect(defaultRestSeconds("duration", 90, squat)).toBe(90);
  });
});

describe("weight", () => {
  it("rounds to 0.25 kg and 0.5 lb", () => {
    expect(parseWeight("22.6", "kg")).toBe(22.5);
    expect(parseWeight("22,9", "kg")).toBe(23);
    expect(parseWeight("100.74", "lb")).toBe(Number((100.5 * 0.45359237).toFixed(3)));
    expect(formatWeight(22.5, "kg")).toBe("22.5");
    expect(formatWeight(60, "kg")).toBe("60");
    expect(formatWeight(22.6, "kg")).toBe("22.5");
  });
  it("round-trips pounds, 45 lb included", () => {
    for (const lb of [2.5, 5, 10, 25, 35, 45, 95, 135, 225, 315, 405, 100.5]) {
      const kg = parseWeight(String(lb), "lb");
      expect(kg).not.toBeNull();
      expect(formatWeight(kg ?? 0, "lb")).toBe(String(lb));
    }
  });
  it("round-trips kilograms", () => {
    for (const kg of [0, 1.25, 20, 42.5, 100]) {
      expect(parseWeight(String(kg), "kg")).toBe(kg);
      expect(formatWeight(kg, "kg")).toBe(String(kg));
    }
  });
  it("refuses text that is not a weight", () => {
    for (const text of ["", " ", "abc", "-5", "1e3", "5kg", "1001", "1.2.3"]) {
      expect(parseWeight(text, "kg"), text).toBeNull();
    }
    expect(parseWeight(" 5 ", "kg")).toBe(5);
  });
});

describe("derivedWorkoutTitle", () => {
  const label = (muscle: string) => muscle.toUpperCase();
  it("names the up to three most frequent groups in first-appearance order", () => {
    expect(
      derivedTitleMuscles([
        "chest",
        "chest",
        "shoulders",
        "triceps",
        "triceps",
        "triceps",
        "biceps",
      ]),
    ).toEqual(["chest", "shoulders", "triceps"]);
    expect(derivedTitleMuscles(["biceps", "chest", "chest", "lats", "lats"])).toEqual([
      "biceps",
      "chest",
      "lats",
    ]);
    expect(derivedTitleMuscles(["glutes", "lats", "chest", "calves", "calves"])).toEqual([
      "glutes",
      "lats",
      "calves",
    ]);
  });
  it("joins the labels with a middle dot", () => {
    expect(derivedWorkoutTitle(["chest", "shoulders", "triceps"], label)).toBe(
      "CHEST · SHOULDERS · TRICEPS",
    );
    expect(derivedWorkoutTitle(["chest"], label)).toBe("CHEST");
    expect(derivedWorkoutTitle([], label)).toBe("");
  });
});

describe("row inputs", () => {
  const id = "0192f0a0-7b3a-7c3e-8a4d-1f2e3d4c5b6a";
  it("caps titles, notes, descriptions and weeks", () => {
    expect(
      programInput.safeParse({ title: " Push ", description: null, planned_weeks: 8 }).data?.title,
    ).toBe("Push");
    expect(
      programInput.safeParse({ title: " ", description: null, planned_weeks: null }).success,
    ).toBe(false);
    expect(
      programInput.safeParse({ title: "x".repeat(101), description: null, planned_weeks: null })
        .success,
    ).toBe(false);
    expect(
      programInput.safeParse({ title: "x", description: "d".repeat(10001), planned_weeks: null })
        .success,
    ).toBe(false);
    expect(
      programInput.safeParse({ title: "x", description: null, planned_weeks: 53 }).success,
    ).toBe(false);
    expect(
      programInput.safeParse({ title: "x", description: null, planned_weeks: 0 }).success,
    ).toBe(false);
    expect(
      workoutInput.safeParse({ program_id: null, title: null, note: "n".repeat(1001) }).success,
    ).toBe(false);
    expect(workoutInput.safeParse({ program_id: null, title: null, note: null }).success).toBe(
      true,
    );
  });
  it("validates Workout exercises and Slots", () => {
    const row = {
      workout_id: id,
      exercise_id: id,
      position: "a0",
      rest_seconds: null,
      note: null,
      superset_group: null,
      sets: [{ kind: "working" }],
    };
    expect(workoutExerciseInput.safeParse(row).success).toBe(true);
    expect(workoutExerciseInput.safeParse({ ...row, rest_seconds: 601 }).success).toBe(false);
    expect(workoutExerciseInput.safeParse({ ...row, position: "a 0" }).success).toBe(false);
    expect(workoutExerciseInput.safeParse({ ...row, user_id: "x" }).success).toBe(false);
    expect(
      programSlotInput.safeParse({ program_id: id, workout_id: null, position: "a1" }).success,
    ).toBe(true);
    expect(
      programSlotInput.safeParse({ program_id: id, workout_id: "nope", position: "a1" }).success,
    ).toBe(false);
  });
});
