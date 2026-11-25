import { prescribe, type LoggedSet, type SessionHistory } from "@workspace/shared";
import type { WorkoutExerciseDetail } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import { previewProgression } from "./preview-progression";

const now = new Date("2026-11-20T12:00:00Z");
const lastTime = "2026-11-18T12:00:00Z";
const account = {
  previousSource: "same_workout",
  unit: "kg",
  weightIncrementKg: 2.5,
  lighterWeeks: [],
  bodyweightKg: null,
  stallMemory: () => ({ dismissed: false }),
} as const;

function preview(entry: WorkoutExerciseDetail, history: SessionHistory[]) {
  const prescribed = prescribe({
    place: {
      exerciseId: entry.exerciseId,
      sourceWorkoutExerciseId: entry.id,
      type: "weight_reps",
      equipment: entry.exercise?.equipment ?? "other",
      workoutId: entry.workoutId,
      gymId: null,
      grid: null,
      stalls: false,
    },
    plan: entry.sets,
    history: history.map((session) => ({ ...session, workoutId: entry.workoutId })),
    account,
    progressionPerSet: entry.exercise?.progressionPerSet,
    now,
  });
  return previewProgression(entry, prescribed, history);
}
const working = { kind: "working", reps_min: 6, reps_max: 8 } as const;
const squat: WorkoutExerciseDetail = {
  id: "plan-squat",
  workoutId: "workout",
  exerciseId: "squat",
  position: "a0",
  restSeconds: null,
  note: null,
  pinnedNote: null,
  supersetGroup: null,
  sets: [{ kind: "warmup", reps_min: 5 }, working, working],
  exercise: {
    title: "Squat",
    primaryMuscle: "quadriceps",
    secondaryMuscles: [],
    equipment: "barbell",
    exerciseType: "weight_reps",
    progressionPerSet: true,
    thumbnailKey: null,
    isArchived: false,
  },
};

function trained(reps: number, kind: LoggedSet["kind"] = "working"): LoggedSet {
  return {
    id: `${kind}-${reps}`,
    exercise_id: "squat",
    exercise_type: "weight_reps",
    kind,
    completed_at: lastTime,
    weight_kg: 77.5,
    reps,
  };
}

function history(sets: LoggedSet[]): SessionHistory[] {
  return [{ id: "last-session", started_at: lastTime, finished_at: lastTime, sets }];
}

describe("workout progression preview", () => {
  it("shows per-set load and rep changes in working-set order, excluding warm-ups", () => {
    const shown = preview(squat, history([trained(5, "warmup"), trained(8), trained(6)]));
    expect(shown?.changes).toMatchObject([
      {
        kind: "working",
        number: 1,
        last: { weight: "77.5", reps: 8 },
        today: { weight: "80", reps: 6 },
        outcome: { reason: "add_weight", changeKg: 2.5 },
      },
      {
        kind: "working",
        number: 2,
        last: { weight: "77.5", reps: 6 },
        today: { weight: "77.5", reps: 7 },
        outcome: { reason: "add_rep" },
      },
    ]);
  });

  it("omits unchanged targets and targets without a matching Previous set", () => {
    expect(preview(squat, [])).toBeNull();
    expect(preview(squat, history([{ ...trained(8), rpe: 10 }]))).toBeNull();
    expect(preview(squat, history([trained(6)]))?.changes).toHaveLength(1);
  });
});
