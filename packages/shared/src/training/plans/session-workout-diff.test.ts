import { describe, expect, it } from "vitest";
import {
  diffSessionAgainstWorkout,
  loggedTargetWeight,
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
      diffSessionAgainstWorkout(
        { exercises: [{ ...logged, sourceWorkoutExerciseId: null }] },
        { exercises: [planned] },
        true,
      ).structure.map((item) => item.kind),
    ).toEqual(["added", "removed"]);
  });
  it("detects replacements without applying old targets", () => {
    const result = diff([{ ...logged, exerciseId: "row" }]);
    expect(result.structure[0]?.kind).toBe("replaced");
    expect(result.targets).toEqual([]);
  });
  it("detects order", () => {
    expect(
      diffSessionAgainstWorkout(
        { exercises: [logged] },
        { exercises: [{ ...planned, id: "other" }, planned] },
        true,
      ).structure[0]?.kind,
    ).toBe("reordered");
  });
  it("detects set counts and kinds", () => {
    expect(diff([{ ...logged, sets: [...logged.sets, ...logged.sets] }]).structure[0]?.kind).toBe(
      "sets",
    );
    expect(
      diff([{ ...logged, sets: [{ ...logged.sets[0]!, kind: "drop" }] }]).structure[0]?.kind,
    ).toBe("sets");
  });
  it("keeps skipped planned sets and matches the next completed set to its ordinal", () => {
    const work = logged.sets[0]!;
    const plan: DiffWorkoutExercise = {
      ...planned,
      sets: [...planned.sets, { kind: "working", weight_kg: 55 }],
    };
    const entry = { ...logged, sets: [{ ...work, completedAt: null }, work] };
    const result = diff([entry], [plan]);
    expect(result.structure).toEqual([]);
    expect(result.targets[0]).toMatchObject({ before: [50, 55], after: [50, 60] });
  });

  it("keeps omitted set and exercise plans without evidence of explicit edits", () => {
    const plan: DiffWorkoutExercise = { ...planned, sets: [...planned.sets, { kind: "drop" }] };
    const other = { ...planned, id: "skipped" };
    expect(diff([logged], [plan, other]).structure).toEqual([]);
    expect(
      diffSessionAgainstWorkout(
        { exercises: [logged] },
        { exercises: [plan, other] },
        true,
      ).structure.map(({ kind }) => kind),
    ).toEqual(["sets", "removed"]);
  });

  it("uses the matching worked set weight and leaves input ranges intact", () => {
    const original = structuredClone(planned);
    expect(diff([logged]).targets[0]).toMatchObject({ before: [50], after: [60] });
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
  it("gives top, back-off and myo sets their own logged weights", () => {
    const set = (kind: "top" | "backoff" | "working", weight_kg: number) => ({
      kind,
      weight_kg,
      reps_min: 5,
      reps_max: 5,
    });
    const plan: DiffWorkoutExercise = {
      ...planned,
      sets: [set("top", 100), set("backoff", 80), set("backoff", 80)],
    };
    const done = (kind: "top" | "backoff", weightKg: number) => ({
      kind,
      weightKg,
      completedAt: "now",
      target: null,
    });
    const result = diff(
      [{ ...logged, sets: [done("top", 105), done("backoff", 85), done("backoff", 82)] }],
      [plan],
    );
    expect(result.structure).toEqual([]);
    expect(result.targets[0]).toMatchObject({ before: [100, 80, 80], after: [105, 85, 82] });
  });
  it("matches drop and failure weights to their own kind", () => {
    const sets: Parameters<typeof loggedTargetWeight>[0] = [
      { kind: "working", weightKg: 60 },
      { kind: "top", weightKg: 100 },
      { kind: "drop", weightKg: 40 },
      { kind: "failure", weightKg: 50 },
    ];
    expect(loggedTargetWeight(sets, "top")).toBe(100);
    expect(loggedTargetWeight(sets, "drop")).toBe(40);
    expect(loggedTargetWeight(sets, "failure")).toBe(50);
    expect(loggedTargetWeight(sets, "myo")).toBeNull();
    expect(loggedTargetWeight(sets, "warmup")).toBeNull();
  });
});

describe("generated warm-ups", () => {
  const work = { ...logged.sets[0]!, weightKg: 50 };
  const ramp = (extra: { generatedWarmup?: boolean; completedAt?: string } = {}) => ({
    kind: "warmup" as const,
    weightKg: 20,
    completedAt: null,
    target: null,
    generatedWarmup: true,
    ...extra,
  });
  it("an untouched auto ramp is not a structure change", () => {
    const result = diff([{ ...logged, sets: [ramp(), ramp(), work] }]);
    expect(result.structure).toEqual([]);
    expect(result.targets).toEqual([]);
    expect(
      diffSessionAgainstWorkout(
        { exercises: [{ ...logged, sets: [ramp(), ramp(), work] }] },
        { exercises: [planned] },
        true,
      ).structure,
    ).toEqual([]);
  });
  it("a generated warm-up the user edited (marker cleared) counts as a real set", () => {
    const result = diff([
      { ...logged, sets: [ramp({ generatedWarmup: false, completedAt: "now" }), work] },
    ]);
    expect(result.structure[0]?.kind).toBe("sets");
  });
  it("planned warm-ups still compare with generated rows ignored", () => {
    const plan: DiffWorkoutExercise = {
      ...planned,
      sets: [{ kind: "warmup" }, ...planned.sets],
    };
    const planWarm = { kind: "warmup" as const, weightKg: null, completedAt: null, target: null };
    expect(diff([{ ...logged, sets: [planWarm, ramp(), work] }], [plan]).structure).toEqual([]);
    // The ramp stands in for the planned warm-up; with none of either it is a real removal.
    expect(diff([{ ...logged, sets: [ramp(), work] }], [plan]).structure).toEqual([]);
    expect(
      diffSessionAgainstWorkout(
        { exercises: [{ ...logged, sets: [work] }] },
        { exercises: [plan] },
        true,
      ).structure[0]?.kind,
    ).toBe("sets");
  });
});
