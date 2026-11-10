import { describe, expect, it } from "vitest";
import {
  diffSessionAgainstWorkout,
  type DiffSessionExercise,
  type DiffWorkoutExercise,
} from "./session-workout-diff";
const planned: DiffWorkoutExercise = {
  id: "source",
  exerciseId: "bench",
  sets: [
    { kind: "working", weight_kg: 50, reps_min: 8, reps_max: 12, effort_min: 8, effort_max: 9 },
  ],
};
const logged: DiffSessionExercise = {
  exerciseId: "bench",
  sourceWorkoutExerciseId: "source",
  sets: [{ kind: "working", weightKg: 60, completedAt: "now", target: planned.sets[0] ?? null }],
};
const diff = (entries: DiffSessionExercise[], plan: DiffWorkoutExercise[] = [planned]) =>
  diffSessionAgainstWorkout({ exercises: entries }, { exercises: plan });
describe("Session against Workout", () => {
  it("adds and removes exercises", () => {
    expect(
      diff([{ ...logged, sourceWorkoutExerciseId: null }]).structure.map((item) => item.kind),
    ).toEqual(["added", "removed"]);
  });
  it("detects replacements without applying old targets", () => {
    const result = diff([{ ...logged, exerciseId: "row" }]);
    expect(result.structure[0]?.kind).toBe("replaced");
    expect(result.targets).toEqual([]);
  });
  it("detects order", () => {
    expect(diff([logged], [{ ...planned, id: "other" }, planned]).structure[0]?.kind).toBe(
      "reordered",
    );
  });
  it("detects set counts and kinds", () => {
    expect(diff([{ ...logged, sets: [...logged.sets, ...logged.sets] }]).structure[0]?.kind).toBe(
      "sets",
    );
    expect(
      diff([{ ...logged, sets: [{ ...logged.sets[0]!, kind: "drop" }] }]).structure[0]?.kind,
    ).toBe("sets");
  });
  it("uses the last working weight and leaves input ranges intact", () => {
    const original = structuredClone(planned);
    expect(diff([logged]).targets[0]).toMatchObject({ before: [50], after: 60 });
    expect(planned).toEqual(original);
    expect(diff([{ ...logged, sets: [{ ...logged.sets[0]!, weightKg: 50 }] }]).targets).toEqual([]);
  });
  it("ignores unticked sets and warmup weights", () => {
    expect(
      diff([{ ...logged, sets: [{ ...logged.sets[0]!, completedAt: null }] }]).targets,
    ).toEqual([]);
    expect(diff([{ ...logged, sets: [{ ...logged.sets[0]!, kind: "warmup" }] }]).targets).toEqual(
      [],
    );
  });
});
