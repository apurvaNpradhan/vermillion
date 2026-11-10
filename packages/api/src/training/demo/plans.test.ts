import { plannedSetsSchema, EXERCISE_TYPES, TRAINING_LIMITS } from "@workspace/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import catalog from "../../exercise/data/exercises.json" with { type: "json" };
import { demoPrograms, demoWorkouts } from "./plans";

describe("training demo fixtures", () => {
  it("references real catalog exercises with valid targets, rests and supersets", () => {
    const byTitle = new Map(catalog.map((exercise) => [exercise.title, exercise]));
    for (const plan of Object.values(demoWorkouts)) {
      expect(plan.exercises.length).toBeLessThanOrEqual(TRAINING_LIMITS.exercisesPerWorkout);
      for (const [index, entry] of plan.exercises.entries()) {
        const exercise = byTitle.get(entry.title);
        expect(exercise, entry.title).toBeDefined();
        if (!exercise) throw new Error(entry.title);
        expect(
          plannedSetsSchema(z.enum(EXERCISE_TYPES).parse(exercise.exercise_type)).safeParse(
            entry.sets,
          ).success,
          entry.title,
        ).toBe(true);
        expect(entry.restSeconds === null || entry.restSeconds <= 600).toBe(true);
        if (entry.superset && plan.exercises[index + 1]?.superset === entry.superset)
          expect(entry.restSeconds).toBeNull();
      }
    }
  });
  it("includes mixed targets, timed work, rest slots and shared workouts", () => {
    const kinds = new Set(
      Object.values(demoWorkouts).flatMap((plan) =>
        plan.exercises.flatMap((entry) => entry.sets.map((set) => set.kind)),
      ),
    );
    expect([...kinds].sort()).toEqual(["drop", "failure", "warmup", "working"]);
    for (const program of demoPrograms) {
      const keys = new Set(program.workouts.map((workout) => workout.key));
      expect(program.rotation).toContain(null);
      for (const key of program.rotation) if (key !== null) expect(keys.has(key)).toBe(true);
    }
  });
});
