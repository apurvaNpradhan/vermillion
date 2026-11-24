import { serializeProgram, serializeWorkout, type ShareExerciseSource } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { summariseImport } from "./import-preview";

const source: ShareExerciseSource = {
  id: "0194a2d0-0000-7000-8000-000000000001",
  custom: false,
  title: "Squat",
  equipment: "barbell",
  exerciseType: "weight_reps",
  primaryMuscle: "quadriceps",
  secondaryMuscles: [],
};
const workout = {
  id: "w",
  title: "Legs",
  note: null,
  exercises: [{ exercise: source, restSeconds: null, note: null, supersetGroup: null, sets: [] }],
};
const matches = [
  {
    exercise: serializeWorkout(workout, { weights: true }).workout.exercises[0]!.exercise,
    match: { kind: "new" as const },
  },
];

describe("summariseImport", () => {
  it("counts a workout and the exercises that will be created", () => {
    expect(summariseImport(serializeWorkout(workout, { weights: true }), matches)).toEqual({
      kind: "workout",
      workouts: 1,
      exercises: 1,
      newExercises: 1,
    });
  });

  it("counts a program's workouts", () => {
    const program = serializeProgram(
      {
        title: "P",
        description: null,
        plannedWeeks: null,
        sessionsPerWeek: null,
        workouts: [workout, { ...workout, id: "x" }],
        rotation: ["w", "x"],
      },
      { weights: true },
    );
    expect(summariseImport(program, [])).toMatchObject({
      kind: "program",
      workouts: 2,
      newExercises: 0,
    });
  });
});
