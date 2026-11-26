import { describe, expect, it } from "vitest";

import type { Equipment } from "../../exercise/vocabulary";
import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { rangeGrid } from "../progress/load-grid";
import type { ContextSession, SuggestionAccount } from "../progress/suggestion-context";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import type { SetKind } from "../vocabulary/vocabulary";
import { prescribe } from "./prescribe";
import { previewRule } from "./preview-rule";
import { stalledExerciseIds } from "./stalled";
import type { RuleConfig } from "./rule-config";

const DAY = 86_400_000;
const START = Date.parse("2026-01-01T12:00:00Z");
const units = [
  { unit: "kg", weight: 100, step: 2.5 },
  { unit: "lb", weight: 225, step: 5 },
] as const;

type Done = {
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  rpe?: number;
  /** What the Session's snapshot said it offered for the set. */
  suggested?: LoggedSet["suggested"];
};

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
        suggested: set.suggested,
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
    equipment: Equipment = "machine",
  ) {
    return prescribe({
      place: {
        exerciseId: "lift",
        sourceWorkoutExerciseId: "plan-lift",
        type: "weight_reps",
        equipment,
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
    equipment: Equipment = "machine",
  ) {
    const seen = [];
    for (let day = from; day < from + count; day += 1) {
      const result = propose(plan, history, day * 2, rule, equipment);
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
            // The snapshot keeps what was offered, and the share a back-off was meant to be.
            suggested: {
              weight_kg: result.progression?.sets[index]?.weightKg ?? null,
              reps: result.progression?.sets[index]?.reps ?? null,
              ...(result.progression?.outcomes[index]?.share === undefined
                ? {}
                : { share: result.progression.outcomes[index]?.share }),
            },
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

    it("ends the stall episode at a Session it reset, so no second deload is offered", () => {
      // Six Sessions at the same load with the last set short: stalled, whichever rule.
      const stuck = (day: number, reset = false) =>
        session(
          day,
          fixed,
          fixed.map((_, index) => ({
            kind: "working" as const,
            weightKg: kg(weight),
            reps: index === 2 ? 4 : 5,
            ...(reset ? { suggested: { weight_kg: kg(weight), reps: 5, reset: true } } : {}),
          })),
        );
      const days = [0, 2, 4, 6, 8, 10];
      const plain = days.map((day) => stuck(day)).reverse();
      expect(propose(fixed, plain, 12, linear).stall).not.toBeNull();
      // The newest Session was the one Linear reset: the episode starts over.
      const reset = [stuck(10, true), ...plain.slice(1)];
      expect(propose(fixed, reset, 12, linear).stall).toBeNull();
      // Double's reset is its own, and a stall deload still answers it: it does not end the count.
      expect(propose(fixed, reset, 12, null).stall).not.toBeNull();
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

    it("keeps its back-off reps inside their range at a big jump on a coarse grid", () => {
      const reps: PlannedSet[] = [
        { kind: "top", reps_min: 6, reps_max: 8 },
        { kind: "backoff", reps_min: 10, reps_max: 12 },
        { kind: "backoff", reps_min: 10, reps_max: 12 },
      ];
      // Dumbbells of 20 and 16: the next step up is more than 10% heavier, where Double asks for
      // more reps before it. A back-off follows the top set's load instead and never leaves 10–12.
      const history = [
        session(0, reps, [
          { kind: "top", weightKg: exact(weight / 5), reps: 8 },
          { kind: "backoff", weightKg: exact((weight / 5) * 0.8), reps: 12 },
          { kind: "backoff", weightKg: exact((weight / 5) * 0.8), reps: 12 },
        ]),
      ];
      const seen = follow(reps, history, rule, 12, 1, "dumbbell");
      for (const { progression } of seen) {
        for (const index of [1, 2]) {
          const set = progression?.sets[index];
          expect(set?.reps).toBeGreaterThanOrEqual(10);
          expect(set?.reps).toBeLessThanOrEqual(12);
          expect(progression?.outcomes[index]?.reason).toBe("backoff_share");
        }
      }
    });

    it("keeps the share steady for 30 Sessions on a fixed-rep top set", () => {
      const fixedTop: PlannedSet[] = [
        { kind: "top", reps_min: 5, reps_max: 5 },
        { kind: "backoff", reps_min: 8, reps_max: 10 },
        { kind: "backoff", reps_min: 8, reps_max: 10 },
      ];
      const [topStart, backoffStart] = unit === "kg" ? [60, 55] : [135, 125];
      const history = [
        session(0, fixedTop, [
          { kind: "top", weightKg: kg(topStart), reps: 5 },
          { kind: "backoff", weightKg: kg(backoffStart), reps: 8 },
          { kind: "backoff", weightKg: kg(backoffStart), reps: 8 },
        ]),
      ];
      const shares = follow(fixedTop, history, rule, 30).map(({ progression }) => {
        const topLoad = progression?.sets[0]?.weightKg ?? 0;
        return (progression?.sets[1]?.weightKg ?? 0) / topLoad;
      });
      // Rounding onto the grid moves a single share by about a step; it never drifts away.
      const first = shares[0] ?? 0;
      for (const share of shares) expect(Math.abs(share - first)).toBeLessThan(0.03);
      expect(Math.abs((shares.at(-1) ?? 0) - first)).toBeLessThan(0.02);
    });

    it("previews the eight Sessions the engine gives when each is followed exactly", () => {
      // The back-off share is meant once (85.7% here); the grid rounds each load but never creeps.
      const history: ContextSession[] = [
        session(0, plan, [
          { kind: "top", weightKg: kg(weight * 1.4), reps: 3 },
          { kind: "backoff", weightKg: kg(weight * 1.2), reps: 5 },
          { kind: "backoff", weightKg: kg(weight * 1.2), reps: 5 },
        ]),
      ];
      const preview = previewRule(
        {
          place: {
            exerciseId: "lift",
            sourceWorkoutExerciseId: "plan-lift",
            type: "weight_reps",
            equipment: "machine",
            workoutId: "w",
            gymId: "home",
            grid,
            stalls: false,
          },
          plan,
          history: [...history],
          account: account(unit),
          rule,
          now: new Date(START + 2 * DAY),
        },
        8,
      );
      const followed = follow(plan, history, rule, 8);
      expect(preview.map(({ sets }) => sets.map(({ weightKg }) => weightKg))).toEqual(
        followed.map(({ progression }) => progression?.sets.map(({ weightKg }) => weightKg)),
      );
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

    it("never asks fewer reps than the range's minimum after a bad day", () => {
      const range: PlannedSet[] = [{ kind: "working", reps_min: 8, reps_max: 12 }];
      const history = [session(0, range, [{ kind: "working", weightKg: kg(weight), reps: 5 }])];
      const result = propose(range, history, 2, maintain);
      expect(result.progression?.sets[0]).toEqual({ weightKg: kg(weight), reps: 8 });
      // A good day above the minimum is repeated as it was.
      const good = [session(0, range, [{ kind: "working", weightKg: kg(weight), reps: 10 }])];
      expect(propose(range, good, 2, maintain).progression?.sets[0]?.reps).toBe(10);
    });

    it("still takes a break into account", () => {
      const history = [start(weight, 8)];
      const result = propose(fixed, history, 40, maintain);
      expect(result.progression?.reason).toBe("after_break");
      expect(result.progression?.sets[0]?.weightKg).toBeLessThan(kg(weight));
    });
  });
});
