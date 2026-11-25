import { describe, expect, it } from "vitest";

import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { rangeGrid } from "../progress/load-grid";
import type { ContextSession, SuggestionAccount } from "../progress/suggestion-context";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import type { SetKind } from "../vocabulary/vocabulary";
import { prescribe } from "./prescribe";
import { stalledExerciseIds } from "./stalled";
import type { RuleConfig } from "./rule-config";

const DAY = 86_400_000;
const START = Date.parse("2026-01-01T12:00:00Z");
const units = [
  { unit: "kg", weight: 100, step: 2.5 },
  { unit: "lb", weight: 225, step: 5 },
] as const;

type Done = { kind: SetKind; weightKg: number | null; reps: number | null; rpe?: number };

function account(unit: "kg" | "lb"): SuggestionAccount {
  return {
    previousSource: "same_workout",
    unit,
    weightIncrementKg: null,
    lighterWeeks: [],
    bodyweightKg: null,
    stallMemory: () => ({ dismissed: false }),
  };
}

describe.each(units)("rules replayed in $unit", ({ unit, weight, step }) => {
  const kg = (value: number) => parseWeight(String(value), unit) ?? 0;
  const exact = (value: number) => (unit === "kg" ? value : value * KG_PER_LB);
  const grid = rangeGrid([{ min: exact(step), max: exact(weight * 3), step: exact(step) }]);

  function session(
    day: number,
    plan: readonly PlannedSet[],
    done: readonly Done[],
  ): ContextSession {
    const at = new Date(START + day * DAY).toISOString();
    return {
      id: `s${day}`,
      workoutId: "w",
      gymId: "home",
      started_at: at,
      finished_at: at,
      sets: done.map((set, index): LoggedSet => ({
        id: `${day}-${index}`,
        exercise_id: "lift",
        session_exercise_id: "entry",
        source_workout_exercise_id: "plan-lift",
        exercise_type: "weight_reps",
        kind: set.kind,
        completed_at: at,
        weight_kg: set.weightKg,
        reps: set.reps,
        rpe: set.rpe,
        target: plan[index] ?? null,
      })),
    };
  }

  /** Asks the engine, as every surface does. */
  function propose(
    plan: readonly PlannedSet[],
    history: readonly ContextSession[],
    day: number,
    rule: RuleConfig | null,
  ) {
    return prescribe({
      place: {
        exerciseId: "lift",
        sourceWorkoutExerciseId: "plan-lift",
        type: "weight_reps",
        equipment: "machine",
        workoutId: "w",
        gymId: "home",
        grid,
        stalls: true,
      },
      plan,
      // A copy: the engine caches what it selects per history array, as it does for a watch result.
      history: [...history],
      account: account(unit),
      rule,
      now: new Date(START + day * DAY),
    });
  }

  /** Follows the suggestion exactly for `count` Sessions, returning every prescription seen. */
  function follow(
    plan: readonly PlannedSet[],
    history: ContextSession[],
    rule: RuleConfig | null,
    count: number,
    from = 1,
  ) {
    const seen = [];
    for (let day = from; day < from + count; day += 1) {
      const result = propose(plan, history, day * 2, rule);
      if (!result.progression) throw new Error("Expected a prescription");
      seen.push(result);
      history.unshift(
        session(
          day * 2,
          plan,
          plan.map((target, index) => ({
            kind: target.kind,
            weightKg: result.progression?.sets[index]?.weightKg ?? null,
            reps: result.progression?.sets[index]?.reps ?? null,
          })),
        ),
      );
    }
    return seen;
  }

  const fixed: PlannedSet[] = Array.from({ length: 3 }, () => ({
    kind: "working",
    reps_min: 5,
    reps_max: 5,
  }));
  const start = (value: number, reps: number, plan: readonly PlannedSet[] = fixed) =>
    session(
      0,
      plan,
      plan.map((target) => ({ kind: target.kind, weightKg: kg(value), reps })),
    );

  describe("linear", () => {
    const linear: RuleConfig = { id: "linear" };

    it("adds load every Session for 20 Sessions on the grid, with the reps fixed", () => {
      const history = [start(weight, 5)];
      const seen = follow(fixed, history, linear, 20);
      let previous = kg(weight);
      for (const { progression } of seen) {
        expect(progression?.reason).toBe("add_weight");
        const load = progression?.sets[0]?.weightKg ?? 0;
        // About 2.5% of the load in whole grid steps: one step at first, never more than three.
        expect(load - previous).toBeGreaterThanOrEqual(exact(step) - 0.01);
        expect(load - previous).toBeLessThanOrEqual(exact(step) * 3 + 0.01);
        previous = load;
        for (const set of progression?.sets ?? []) {
          expect(set?.reps).toBe(5);
          expect(set?.weightKg).toBe(load);
          expect(grid?.nearest(set?.weightKg ?? 0)).toBeCloseTo(set?.weightKg ?? 0, 3);
        }
      }
      expect(seen[0]?.progression?.sets[0]?.weightKg).toBeCloseTo(exact(weight + step), 2);
      expect(stalledExerciseIds([session(0, fixed, [])], new Map(), account(unit))).toEqual([]);
    });

    it("holds after a first miss, resets 10% after the second, then builds again", () => {
      const history = [start(weight, 5)];
      follow(fixed, history, linear, 1);
      const missed = (day: number, load: number) =>
        session(day, fixed, [
          { kind: "working", weightKg: kg(load), reps: 5 },
          { kind: "working", weightKg: kg(load), reps: 4 },
          { kind: "working", weightKg: kg(load), reps: 3 },
        ]);
      const failing = weight + step;
      history.unshift(missed(10, failing));
      const hold = propose(fixed, history, 12, linear);
      expect(hold.progression?.reason).toBe("hold_missed");
      expect(hold.progression?.sets[0]).toEqual({ weightKg: kg(failing), reps: 5 });
      history.unshift(missed(12, failing));
      const reset = propose(fixed, history, 14, linear);
      expect(reset.progression?.reason).toBe("reset");
      const lowered = reset.progression?.sets[0]?.weightKg ?? 0;
      expect(lowered).toBeLessThan(kg(failing));
      // Rounded down onto the grid, within one step of 10% off.
      expect(lowered / kg(failing)).toBeGreaterThan(0.85);
      expect(lowered / kg(failing)).toBeLessThanOrEqual(0.9 + 1e-6);
      expect(grid?.nearest(lowered)).toBeCloseTo(lowered, 3);
      history.unshift(
        session(
          14,
          fixed,
          fixed.map(() => ({ kind: "working", weightKg: lowered, reps: 5 })),
        ),
      );
      expect(propose(fixed, history, 16, linear).progression?.reason).toBe("add_weight");
    });

    it("counts a miss only at the same load", () => {
      const history = [start(weight, 5)];
      history.unshift(
        session(
          2,
          fixed,
          fixed.map(() => ({ kind: "working", weightKg: kg(weight), reps: 4 })),
        ),
      );
      history.unshift(
        session(
          4,
          fixed,
          fixed.map(() => ({ kind: "working", weightKg: kg(weight - step), reps: 4 })),
        ),
      );
      expect(propose(fixed, history, 6, linear).progression?.reason).toBe("hold_missed");
    });

    it("keeps the other sets' suggestions when a set is added", () => {
      const history = [start(weight, 5)];
      const grown: PlannedSet[] = [...fixed, fixed[0] as PlannedSet];
      const before = propose(fixed, history, 2, linear).progression?.sets;
      const after = propose(grown, history, 2, linear).progression?.sets;
      expect(after?.slice(0, 3)).toEqual(before);
      expect(after?.[3]).toEqual(before?.[2]);
    });

    it("is the Double rule on a lift with no load", () => {
      const reps: PlannedSet[] = [{ kind: "working", reps_min: 8, reps_max: 12 }];
      const at = new Date(START).toISOString();
      const history: ContextSession[] = [
        {
          id: "s0",
          workoutId: "w",
          gymId: "home",
          started_at: at,
          finished_at: at,
          sets: [
            {
              id: "a",
              exercise_id: "lift",
              source_workout_exercise_id: "plan-lift",
              exercise_type: "reps_only",
              kind: "working",
              completed_at: at,
              reps: 9,
            },
          ],
        },
      ];
      const result = prescribe({
        place: {
          exerciseId: "lift",
          sourceWorkoutExerciseId: "plan-lift",
          type: "reps_only",
          equipment: "none",
          workoutId: "w",
          gymId: null,
          grid: null,
          stalls: false,
        },
        plan: reps,
        history,
        account: account(unit),
        rule: linear,
        now: new Date(START + 2 * DAY),
      });
      expect(result.progression?.sets[0]).toEqual({ weightKg: null, reps: 10 });
    });
  });

  describe("top set and back-offs", () => {
    const plan: PlannedSet[] = [
      { kind: "top", reps_min: 3, reps_max: 5 },
      { kind: "backoff", reps_min: 5, reps_max: 8 },
      { kind: "backoff", reps_min: 5, reps_max: 8 },
    ];
    const rule: RuleConfig = { id: "top_backoff" };
    const first = (history: ContextSession[]) =>
      history.unshift(
        session(0, plan, [
          { kind: "top", weightKg: kg(weight), reps: 3 },
          { kind: "backoff", weightKg: kg(weight - step * 6), reps: 5 },
          { kind: "backoff", weightKg: kg(weight - step * 6), reps: 5 },
        ]),
      );

    it("keeps the back-offs a steady share of the top set for 20 Sessions", () => {
      const history: ContextSession[] = [];
      first(history);
      const seen = follow(plan, history, rule, 20);
      for (const { progression } of seen) {
        const topLoad = progression?.sets[0]?.weightKg ?? 0;
        const backoffs = [progression?.sets[1], progression?.sets[2]];
        // Both back-offs move together and stay under the top set.
        expect(backoffs[0]?.weightKg).toBe(backoffs[1]?.weightKg);
        expect(backoffs[0]?.weightKg ?? 0).toBeLessThan(topLoad);
        expect((backoffs[0]?.weightKg ?? 0) / topLoad).toBeGreaterThan(0.8);
        expect((backoffs[0]?.weightKg ?? 0) / topLoad).toBeLessThan(0.9);
        expect(backoffs[0]?.reps).toBeGreaterThanOrEqual(5);
        expect(backoffs[0]?.reps).toBeLessThanOrEqual(8);
        expect(progression?.outcomes[1]?.reason).toBe("backoff_share");
        expect(grid?.nearest(topLoad)).toBeCloseTo(topLoad, 3);
        expect(grid?.nearest(backoffs[0]?.weightKg ?? 0)).toBeCloseTo(
          backoffs[0]?.weightKg ?? 0,
          3,
        );
      }
      expect(seen.at(-1)?.progression?.sets[0]?.weightKg).toBeGreaterThan(kg(weight));
    });

    it("uses the rule's own share over last time's", () => {
      const history: ContextSession[] = [];
      first(history);
      const result = propose(plan, history, 2, { id: "top_backoff", backoff_percent: 80 });
      const topLoad = result.progression?.sets[0]?.weightKg ?? 0;
      const backoff = result.progression?.sets[1]?.weightKg ?? 0;
      // The nearest load the grid can make to 80% of the top set.
      expect(Math.abs(backoff - topLoad * 0.8)).toBeLessThanOrEqual(exact(step) / 2 + 1e-6);
      expect(result.progression?.outcomes[1]?.loadFactor).toBeCloseTo(backoff / topLoad, 6);
    });

    it("is the Double rule when the plan has no back-offs", () => {
      const onlyTop: PlannedSet[] = [{ kind: "top", reps_min: 3, reps_max: 5 }];
      const history = [session(0, onlyTop, [{ kind: "top", weightKg: kg(weight), reps: 5 }])];
      const asRule = propose(onlyTop, history, 2, rule).progression;
      const asDouble = propose(onlyTop, history, 2, null).progression;
      expect(asRule).toEqual(asDouble);
    });
  });

  describe("maintain", () => {
    const maintain: RuleConfig = { id: "maintain" };

    it("repeats last time for 20 Sessions and is never stalled", () => {
      const history = [start(weight, 8)];
      const seen = follow(fixed, history, maintain, 20);
      for (const { progression, stall } of seen) {
        expect(progression?.reason).toBe("same_as_last");
        expect(progression?.sets[0]).toEqual({ weightKg: kg(weight), reps: 8 });
        expect(stall).toBeNull();
      }
      const plain = propose(fixed, history, 60, null);
      expect(plain.stall).not.toBeNull();
      expect(
        stalledExerciseIds(
          [{ workoutId: "w", gymId: "home", sets: history[0]?.sets ?? [] }],
          new Map([["lift", history]]),
          account(unit),
          new Map([["lift", maintain]]),
        ),
      ).toEqual([]);
    });

    it("still takes a break into account", () => {
      const history = [start(weight, 8)];
      const result = propose(fixed, history, 40, maintain);
      expect(result.progression?.reason).toBe("after_break");
      expect(result.progression?.sets[0]?.weightKg).toBeLessThan(kg(weight));
    });
  });
});
