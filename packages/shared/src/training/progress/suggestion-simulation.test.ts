import { describe, expect, it } from "vitest";

import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import { rangeGrid } from "./load-grid";
import { suggestNext, type SuggestedSet } from "./progression";
import { stalledSessions } from "./stalled-lift";
import { suggestionContext, type ContextSession } from "./suggestion-context";

const DAY = 86_400_000;
const START = Date.parse("2026-01-01T12:00:00Z");
const plan: PlannedSet[] = Array.from({ length: 2 }, () => ({
  kind: "working",
  reps_min: 6,
  reps_max: 8,
}));
const units = [
  { unit: "kg", weight: 60, step: 2.5 },
  { unit: "lb", weight: 135, step: 5 },
] as const;

describe.each(units)("replaying Sessions in $unit", ({ unit, weight, step }) => {
  const kg = (value: number) => parseWeight(String(value), unit) ?? 0;
  const exact = (value: number) => (unit === "kg" ? value : value * KG_PER_LB);
  const grid = rangeGrid([{ min: exact(step), max: exact(weight + step * 12), step: exact(step) }]);
  const workoutId = "strength";
  const settings = { weightUnit: unit, weightIncrementKg: null };

  function train(
    day: number,
    targets: readonly (SuggestedSet | null)[],
    options: {
      gymId?: string;
      phase?: ContextSession["phase"];
      rpe?: LoggedSet["rpe"];
    } = {},
  ): ContextSession {
    const date = new Date(START + day * DAY).toISOString();
    return {
      id: String(day),
      workoutId,
      gymId: options.gymId ?? "home",
      phase: options.phase,
      started_at: date,
      finished_at: date,
      sets: targets.flatMap((target, index) =>
        target
          ? [
              {
                id: `${day}-${index}`,
                exercise_id: "lift",
                exercise_type: "weight_reps",
                kind: "working",
                completed_at: date,
                weight_kg: target.weightKg,
                reps: target.reps,
                rpe: options.rpe,
              },
            ]
          : [],
      ),
    };
  }
  const startingTargets = plan.map(() => ({ weightKg: kg(weight), reps: 6 }));
  const propose = (history: readonly ContextSession[], day: number, targets = plan) =>
    suggestNext(targets, history, "weight_reps", "machine", settings, {
      now: new Date(START + day * DAY),
      grid,
    });

  it("progresses across 18 Sessions while new slots leave existing suggestions intact", () => {
    const history = [train(0, startingTargets)];
    for (let index = 1; index <= 18; index += 1) {
      const day = index * 2;
      const result = propose(history, day);
      if (!result) throw new Error("Expected progression");
      const extra = propose(history, day, [
        ...plan,
        { kind: "working", reps_min: 12, reps_max: 16 },
      ]);
      expect(extra?.sets.slice(0, 2)).toEqual(result.sets);
      expect(extra?.sets[2]).toEqual(result.sets[1]);
      for (const set of result.sets) {
        const weight = set?.weightKg ?? 0;
        expect(grid?.nearest(weight)).toBeCloseTo(weight, 3);
        expect(weight).toBeLessThanOrEqual((grid?.capKg ?? 0) + 0.001);
      }
      history.unshift(train(day, result.sets));
      expect(stalledSessions(history, "weight_reps")).toBe(0);
    }
    expect(history[0]?.sets[0]?.weight_kg).toBe(kg(weight + step * 6));
  });

  it("lowers after repeated misses but holds a completed grind at the ceiling", () => {
    const history = [
      train(
        0,
        startingTargets.map((set) => ({ ...set, reps: 5 })),
        { rpe: 10 },
      ),
    ];
    for (let index = 1; index <= 8; index += 1) {
      const result = propose(history, index);
      if (!result) throw new Error("Expected a target after a miss");
      expect(result.reason).toBe(index === 1 ? "hold_effort" : "reset");
      history.unshift(
        train(
          index,
          result.sets.map((set) => set && { ...set, reps: 5 }),
          { rpe: 10 },
        ),
      );
    }
    expect(history[0]?.sets[0]?.weight_kg).toBeLessThan(kg(weight));
    const grinds = [
      train(
        0,
        startingTargets.map((set) => ({ ...set, reps: 8 })),
        { rpe: 10 },
      ),
    ];
    for (let index = 1; index <= 6; index += 1) {
      const result = propose(grinds, index);
      expect(result?.reason).toBe("hold_effort");
      expect(result?.sets).toEqual(startingTargets.map((set) => ({ ...set, reps: 8 })));
      if (result) grinds.unshift(train(index, result.sets, { rpe: 10 }));
    }
  });

  it("keeps the break clock across gyms and uses the chosen gym's baseline on a lighter day", () => {
    const targets = (amount: number) => plan.map(() => ({ weightKg: kg(amount), reps: 8 }));
    const history = [
      train(10, targets(weight + step * 4), { gymId: "away" }),
      train(0, targets(weight)),
    ];
    const current = train(12, targets(weight), { phase: "deload" });
    const context = (sets: readonly ContextSession[], day: number) => {
      const { settings } = suggestionContext(
        sets,
        {
          exerciseId: "lift",
          type: "weight_reps",
          equipment: "machine",
          workoutId,
          gymId: "home",
          grid,
          phaseLoad: 0.9,
          stalls: true,
        },
        {
          unit,
          previousSource: "same_workout",
          weightIncrementKg: null,
          lighterWeeks: [],
          bodyweightKg: null,
          stallMemory: () => ({ dismissed: false, applied: false }),
        },
      );
      return suggestNext(plan, sets, "weight_reps", "machine", settings, {
        now: new Date(START + day * DAY),
        ...settings,
      });
    };
    const lighter = context(history, 11);
    expect(lighter?.reason).toBe("deload");
    expect(lighter?.sets[0]?.weightKg).toBeLessThan(kg(weight));
    expect(context([current, ...history], 13)?.sets).toEqual(lighter?.sets);
    expect(context([current, ...history], 102)).toMatchObject({
      reason: "after_break",
      breakDays: 90,
    });
  });
});
