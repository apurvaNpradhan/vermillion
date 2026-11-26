import { describe, expect, it } from "vitest";

import type { PlannedSet } from "../plans/planned-sets";
import type { LoggedSet } from "../logging/logged-set";
import { prescribedSetSchema, prescriptionSchema } from "../progress/prescription";
import type { ContextSession, SuggestionAccount } from "../progress/suggestion-context";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import { stalledExerciseIds } from "./stalled";
import { prescribe, type PrescribeInput } from "./prescribe";
import { previewRule } from "./preview-rule";

const DAY = 86_400_000;
const NOW = new Date("2026-03-01T12:00:00Z");
const target: PlannedSet = { kind: "working", reps_min: 8, reps_max: 12 };
const plan: PlannedSet[] = [target, target, target];

function session(daysAgo: number, weightKg: number, reps: number): ContextSession {
  const at = new Date(NOW.getTime() - daysAgo * DAY).toISOString();
  return {
    id: `session-${daysAgo}`,
    workoutId: "push",
    gymId: null,
    started_at: at,
    finished_at: at,
    sets: [0, 1, 2].map((index) => ({
      id: `${daysAgo}-${index}`,
      exercise_id: "bench",
      session_exercise_id: "entry",
      source_workout_exercise_id: "plan-bench",
      exercise_type: "weight_reps",
      kind: "working",
      completed_at: at,
      weight_kg: weightKg,
      reps,
      target,
    })),
  };
}

const account = (unit: "kg" | "lb"): SuggestionAccount => ({
  previousSource: "same_workout",
  unit,
  weightIncrementKg: null,
  lighterWeeks: [],
  bodyweightKg: null,
  stallMemory: () => ({ dismissed: false }),
});

const input = (unit: "kg" | "lb", history: ContextSession[]): PrescribeInput => ({
  place: {
    exerciseId: "bench",
    sourceWorkoutExerciseId: "plan-bench",
    type: "weight_reps",
    equipment: "barbell",
    workoutId: "push",
    gymId: null,
    grid: null,
    stalls: true,
  },
  plan,
  history,
  account: account(unit),
  now: NOW,
});

describe.each([
  { unit: "kg", load: 60, next: 62.5 },
  { unit: "lb", load: 135, next: 140 },
] as const)("prescribe in $unit", ({ unit, load, next }) => {
  const kilograms = (value: number) => parseWeight(String(value), unit) ?? 0;
  const topped = [session(4, kilograms(load), 12)];

  it("prescribes the step and keeps the context every surface reads from", () => {
    const result = prescribe(input(unit, topped));
    expect(result.rule).toEqual({ id: "double" });
    expect(result.source).toBe("computed");
    expect(result.unit).toBe(unit);
    expect(result.progression?.reason).toBe("add_weight");
    for (const set of result.progression?.sets ?? []) {
      expect(set?.weightKg).toBeCloseTo(unit === "kg" ? next : next * KG_PER_LB, 2);
      expect(set?.reps).toBe(8);
    }
    expect(result.history).toHaveLength(1);
    expect(result.settings.weightUnit).toBe(unit);
  });

  it("gives the Session entry and the Workout entry the same answer", () => {
    // A Session's sets carry their own targets; a Workout preview reads the plan itself.
    const fromSession = prescribe({ ...input(unit, topped), progressionPerSet: false });
    const fromWorkout = prescribe({ ...input(unit, topped), plan: [...plan] });
    expect(fromWorkout.progression).toEqual(fromSession.progression);
  });

  it("reads a Session's snapshot instead of recomputing it", () => {
    const setIds = [
      "0192f0a0-0000-7000-8000-000000000001",
      "0192f0a0-0000-7000-8000-000000000002",
      "0192f0a0-0000-7000-8000-000000000003",
    ];
    const prescription = prescriptionSchema.parse({
      exerciseId: "0192f0a0-0000-7000-8000-0000000000e1",
      revision: "0192f0a0-0000-7000-8000-0000000000a1",
      previousRevision: null,
      reason: "hold_missed",
      incrementKg: 2.5,
      breakDays: null,
      capKg: null,
      sets: setIds.map((id) => ({
        id,
        ghosts: { weight: kilograms(load), reps: 9 },
        outcome: { reason: "hold_missed" },
      })),
    });
    const result = prescribe({ ...input(unit, topped), snapshot: { prescription, setIds } });
    expect(result.source).toBe("snapshot");
    expect(result.progression?.reason).toBe("hold_missed");
    expect(result.progression?.sets[0]).toEqual({ weightKg: kilograms(load), reps: 9 });
  });

  it("reads the context without suggesting when asked", () => {
    const result = prescribe({ ...input(unit, topped), suggest: false });
    expect(result.progression).toBeNull();
    expect(result.history).toHaveLength(1);
  });

  it("reports the stall verdict that Home counts", () => {
    const flat = [0, 7, 14, 21].map((days) => session(days, kilograms(load), 8));
    const result = prescribe(input(unit, flat));
    expect(result.stall?.count).toBe(3);
    expect(
      stalledExerciseIds(
        [{ workoutId: "push", gymId: null, sets: flat[0]?.sets as LoggedSet[] }],
        new Map([["bench", flat]]),
        account(unit),
      ),
    ).toEqual(["bench"]);
  });
});

describe.each([
  { unit: "kg", load: 60 },
  { unit: "lb", load: 135 },
] as const)("previewRule in $unit", ({ unit, load }) => {
  const kilograms = parseWeight(String(load), unit) ?? 0;
  const history = [session(7, kilograms, 12)];

  it("projects four Sessions of the rule if every set is made", () => {
    const preview = previewRule({ ...input(unit, history), rule: { id: "double" } });
    expect(preview).toHaveLength(4);
    expect(preview[0]?.reason).toBe("add_weight");
    const loads = preview.map(({ sets }) => sets[0]?.weightKg ?? 0);
    expect(loads[0]).toBeGreaterThan(kilograms);
    // Reps climb from the bottom of the range before the next load.
    expect(preview[1]?.sets[0]?.reps).toBe(9);
    expect(loads[1]).toBe(loads[0]);
    // The real history is untouched.
    expect(history).toHaveLength(1);
  });

  it("shows a maintained lift repeating", () => {
    const preview = previewRule({ ...input(unit, history), rule: { id: "maintain" } });
    expect(preview.map(({ sets }) => sets[0])).toEqual(
      Array.from({ length: 4 }, () => ({ kind: "working", weightKg: kilograms, reps: 12 })),
    );
  });

  it("starts from the plan with no history, and says nothing without a load", () => {
    const planned = plan.map((set) => ({ ...set, weight_kg: kilograms }));
    const fromPlan = previewRule({ ...input(unit, []), plan: planned });
    expect(fromPlan[0]?.sets[0]).toMatchObject({ weightKg: kilograms });
    expect(previewRule(input(unit, []))).toEqual([]);
  });
});

describe.each(["kg", "lb"] as const)(
  "Top set and back-offs on a weighted pull-up at +0 in %s",
  (unit) => {
    const targets: PlannedSet[] = [
      { kind: "top", reps_min: 6, reps_max: 8 },
      { kind: "backoff", reps_min: 8, reps_max: 10 },
      { kind: "backoff", reps_min: 8, reps_max: 10 },
    ];
    const at = new Date(NOW.getTime() - 7 * DAY).toISOString();
    const last: ContextSession = {
      id: "last",
      workoutId: "pull",
      gymId: null,
      started_at: at,
      finished_at: at,
      sets: [
        { kind: "top" as const, reps: 6 },
        { kind: "backoff" as const, reps: 8 },
        { kind: "backoff" as const, reps: 8 },
      ].map(({ kind, reps }, index): LoggedSet => ({
        id: `pull-${index}`,
        exercise_id: "pull-up",
        session_exercise_id: "entry",
        source_workout_exercise_id: "plan-pull-up",
        exercise_type: "bodyweight_weighted_reps",
        kind,
        completed_at: at,
        weight_kg: 0,
        reps,
        bodyweight_kg: 80,
        target: targets[index] ?? null,
      })),
    };

    it("writes back-off outcomes the snapshot schema accepts", () => {
      const result = prescribe({
        place: {
          exerciseId: "pull-up",
          sourceWorkoutExerciseId: "plan-pull-up",
          type: "bodyweight_weighted_reps",
          equipment: "none",
          workoutId: "pull",
          gymId: null,
          grid: null,
          stalls: true,
        },
        plan: targets,
        history: [last],
        account: account(unit),
        rule: { id: "top_backoff" },
        now: NOW,
      });
      const outcomes = result.progression?.outcomes ?? [];
      expect(outcomes[1]?.reason).toBe("backoff_share");
      for (const outcome of outcomes) {
        expect(
          prescribedSetSchema.safeParse({
            id: "0192f0a0-0000-7000-8000-000000000001",
            ghosts: {},
            outcome,
          }).success,
        ).toBe(true);
      }
      // No load factor to report when the top set carries no added weight.
      expect(outcomes[1]?.loadFactor).toBeUndefined();
    });
  },
);
