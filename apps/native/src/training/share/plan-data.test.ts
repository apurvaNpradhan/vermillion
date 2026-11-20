import { describe, expect, it } from "vitest";
import type { WorkoutDetail, WorkoutExerciseDetail } from "@workspace/sync";
import { cardRows, daysPerWeek, planLoads, setCounts, workoutDays } from "./plan-data";

const entry = (id: string, group: string | null = null): WorkoutExerciseDetail => ({
  id,
  workoutId: "w",
  exerciseId: id,
  position: id,
  restSeconds: null,
  note: null,
  supersetGroup: group,
  sets: [{ kind: "working" }, { kind: "warmup" }],
  exercise: {
    title: id,
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps"],
    equipment: "barbell",
    exerciseType: "weight_reps",
    progressionPerSet: false,
    thumbnailKey: null,
    isArchived: false,
  },
});
const workout: WorkoutDetail = {
  id: "w",
  programId: null,
  title: "Push",
  note: null,
  exercises: [entry("a")],
};

describe("plan Share data", () => {
  it("counts working and warm-up sets independently, including empty plans", () => {
    expect(setCounts([])).toEqual({ working: 0, warmup: 0 });
    expect(setCounts([{ kind: "working" }, { kind: "warmup" }, { kind: "warmup" }])).toEqual({
      working: 1,
      warmup: 2,
    });
  });
  it("counts repeated slots and keeps their Rotation day numbers around Rest", () => {
    const slots = [
      { workoutId: "w", workout },
      { workoutId: null, workout: null },
      { workoutId: "w", workout },
    ];
    expect(daysPerWeek(slots)).toBe(2);
    expect(daysPerWeek([])).toBe(0);
    expect(workoutDays(slots).map(({ day, total, workout: w }) => [day, total, w.id])).toEqual([
      [1, 3, "w"],
      [3, 3, "w"],
    ]);
  });
  it("keeps day numbers and counts when a Workout is not synced yet", () => {
    const slots = [
      { workoutId: "gone", workout: null },
      { workoutId: null, workout: null },
      { workoutId: "w", workout },
    ];
    expect(daysPerWeek(slots)).toBe(2);
    expect(workoutDays(slots).map(({ day, total }) => [day, total])).toEqual([[3, 3]]);
  });
  it("brackets only adjacent runs and closes a run at the truncation boundary", () => {
    const rows = [entry("a", "g"), entry("b", "g"), entry("c"), entry("d", "g")];
    expect(cardRows(rows).items.map((row) => row.place)).toEqual(["first", "last", "none", "none"]);
    const long = Array.from({ length: 14 }, (_, index) => entry(String(index), "g"));
    const compact = cardRows(long);
    expect(compact.items).toHaveLength(12);
    expect(compact.items[11]?.place).toBe("last");
    expect(compact.more).toBe(2);
  });
  it("excludes warm-ups from distribution and includes repeated slots", () => {
    expect(planLoads([workout, workout])).toEqual([
      { muscle: "chest", sets: 2 },
      { muscle: "triceps", sets: 1 },
    ]);
  });
});
