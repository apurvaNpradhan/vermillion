import { describe, expect, it } from "vitest";

import type { PlannedSet } from "../plans/planned-sets";
import type { LoggedSet } from "../logging/logged-set";
import { prescriptionSchema } from "../progress/prescription";
import type { ContextSession, SuggestionAccount } from "../progress/suggestion-context";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import { stalledExerciseIds } from "./stalled";
import { prescribe, type PrescribeInput } from "./prescribe";

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
