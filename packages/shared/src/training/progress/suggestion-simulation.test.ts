import { describe, expect, it } from "vitest";

import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import { barGrid, rangeGrid } from "./load-grid";
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
      target?: PlannedSet;
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
                target: options.target,
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

  it("never flags a stall during 8–12 double progression", () => {
    const target = { kind: "working", reps_min: 8, reps_max: 12 } as const;
    const targets = [target, target, target];
    const history = [
      train(
        0,
        targets.map(() => ({ weightKg: kg(weight), reps: 8 })),
        { target },
      ),
    ];
    for (let day = 1; day <= 24; day += 1) {
      const next = propose(history, day, targets);
      if (!next) throw new Error("Expected progression");
      history.unshift(train(day, next.sets, { target }));
      expect(stalledSessions(history, "weight_reps")).toBe(0);
    }
    expect(history[0]?.sets[0]?.weight_kg).toBeCloseTo(exact(weight + step * 4), 2);
  });

  it("excludes an applied stall deload and lets the lift rebuild for three Sessions", () => {
    const at = (amount: number) => plan.map(() => ({ weightKg: kg(amount), reps: 8 }));
    const flat = [3, 2, 1, 0].map((day) => train(day, at(weight)));
    expect(stalledSessions(flat, "weight_reps")).toBe(3);
    const light = train(4, at(weight - step * 2));
    light.sets = light.sets.map((set) => ({ ...set, stall_deload: true }));
    const history = [light, ...flat];
    for (let day = 5; day <= 6; day += 1) {
      expect(stalledSessions(history, "weight_reps")).toBe(0);
      history.unshift(train(day, at(weight)));
    }
    expect(stalledSessions([train(7, at(weight)), ...history], "weight_reps")).toBe(6);
    expect(stalledSessions([train(7, at(weight + step)), ...history], "weight_reps")).toBe(0);
  });

  it("requires two misses at the same load again after a reset", () => {
    const targets: PlannedSet[] = plan.map((set) => ({ ...set, reps_min: 8, reps_max: 10 }));
    const missed = (amount: number, reps: number) =>
      targets.map(() => ({ weightKg: kg(amount), reps }));
    const history = [train(0, missed(weight, 6), { rpe: 10 })];
    expect(propose(history, 1, targets)?.reason).toBe("hold_missed");
    history.unshift(train(1, missed(weight, 6), { rpe: 10 }));
    const resetLoad = weight - step * 2;
    expect(propose(history, 2, targets)).toMatchObject({
      reason: "reset",
      sets: targets.map(() => ({ weightKg: grid?.nearest(exact(resetLoad)), reps: 8 })),
    });
    history.unshift(train(2, missed(resetLoad, 7), { rpe: 10 }));
    expect(propose(history, 3, targets)).toMatchObject({
      reason: "hold_missed",
      sets: missed(resetLoad, 7),
    });
    history.unshift(train(3, missed(resetLoad, 7)));
    expect(propose(history, 4, targets)).toMatchObject({
      reason: "reset",
      sets: targets.map(() => ({ weightKg: grid?.nearest(exact(resetLoad - step)), reps: 8 })),
    });
  });

  it("holds a completed grind once at the same load and reps", () => {
    const topped = startingTargets.map((set) => ({ ...set, reps: 8 }));
    const grinds = [train(0, topped, { rpe: 10 })];
    expect(propose(grinds, 1)).toMatchObject({ reason: "hold_effort", sets: topped });
    grinds.unshift(train(1, topped, { rpe: 10 }));
    expect(propose(grinds, 2)).toMatchObject({
      reason: "add_weight",
      sets: plan.map(() => ({ weightKg: expect.closeTo(exact(weight + step), 2), reps: 6 })),
    });
  });

  it.each([
    { logged: 7, target: 7, steps: 1 },
    { logged: 10, target: 9.5, steps: 1 },
    { logged: 7, target: 9, steps: 2 },
    { logged: 9, target: 8, steps: 0 },
  ] as const)(
    "judges RPE $logged against the logged target $target",
    ({ logged, target, steps }) => {
      const topped = startingTargets.map((set) => ({ ...set, reps: 8 }));
      const snapshot: PlannedSet = {
        kind: "working",
        reps_min: 6,
        reps_max: 8,
        effort_min: target,
        effort_max: target,
      };
      const history = [train(0, topped, { rpe: logged, target: snapshot })];
      expect(propose(history, 1)?.sets[0]).toMatchObject({
        weightKg: expect.closeTo(exact(weight + step * steps), 2),
        reps: steps ? 6 : 8,
      });
      const misses = [1, 0].map((day) =>
        train(
          day,
          topped.map((set) => ({ ...set, reps: 5 })),
          {
            rpe: logged,
            target: snapshot,
          },
        ),
      );
      expect(propose(misses, 2)?.reason).toBe(steps ? "add_rep" : "reset");
    },
  );

  it("uses physical automatic steps with legacy microplates and no stack setting", () => {
    const amount = unit === "kg" ? 20 : 45;
    const stacked = plan.map(() => ({ weightKg: kg(amount), reps: 8 }));
    const history = [train(0, stacked)];
    const now = new Date(START + DAY);
    const plates = [{ weightKg: exact(unit === "kg" ? 0.5 : 1.25), count: null }];
    const legacyKit = barGrid({ weightKg: exact(amount) }, plates);
    const bar = suggestNext(plan, history, "weight_reps", "barbell", settings, {
      now,
      grid: legacyKit,
    });
    expect(bar?.sets[0]?.weightKg).toBeCloseTo(exact(amount + (unit === "kg" ? 3 : 5)), 2);
    for (const equipment of ["machine", "cable", "smith_machine"] as const) {
      expect(
        suggestNext(plan, history, "weight_reps", equipment, settings, { now })?.sets[0]?.weightKg,
      ).toBeCloseTo(exact(amount + step), 2);
    }
    expect(
      suggestNext(plan, history, "weight_reps", "kettlebell", settings, { now })?.sets[0]?.weightKg,
    ).toBeCloseTo(exact(amount + (unit === "kg" ? 4 : 10)), 2);
    expect(
      suggestNext(plan, history, "bodyweight_weighted_reps", "none", settings, { now })?.sets[0]
        ?.weightKg,
    ).toBeCloseTo(exact(amount + (unit === "kg" ? 1.25 : 2.5)), 2);
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
