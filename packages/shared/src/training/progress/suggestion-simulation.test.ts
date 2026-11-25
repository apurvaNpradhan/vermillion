import { describe, expect, it } from "vitest";

import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { applyPhase, phaseFor, phasePlanSchema } from "../phases/phases";
import { recordFlags, exerciseRecords } from "./records";
import { testWorkingLoad } from "../phases/test-load";
import { runWeek } from "../plans/cycle";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import { barGrid, rangeGrid } from "./load-grid";
import { suggestNext, type SuggestedSet } from "./progression";
import { missedSuggestions, stalledSessions } from "./stalled-lift";
import { prescriptionSchema } from "./prescription";
import { adjustmentLoadsFor, adjustPrescription } from "./same-day-adjustment";
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

  it("rebuilds after a stall deload and counts only a new plateau", () => {
    const target: PlannedSet = { kind: "working", reps_min: 6, reps_max: 8 };
    const at = (amount: number) => plan.map(() => ({ weightKg: kg(amount), reps: 8 }));
    const history = [3, 2, 1, 0].map((day) => train(day, at(weight), { target }));
    expect(stalledSessions(history, "weight_reps")).toBe(3);
    const deload = suggestNext(plan, history, "weight_reps", "machine", settings, {
      now: new Date(START + 4 * DAY),
      grid,
      deload: true,
    });
    expect(deload?.reason).toBe("deload");
    const light = train(4, deload?.sets ?? [], { target });
    light.sets = light.sets.map((set) => ({ ...set, stall_deload: true }));
    history.unshift(light);
    for (let day = 5; day <= 18; day += 1) {
      expect(stalledSessions(history, "weight_reps")).toBe(0);
      history.unshift(train(day, propose(history, day)?.sets ?? [], { target }));
    }
    expect(stalledSessions(history, "weight_reps")).toBe(0);
    expect(history[0]?.sets[0]?.weight_kg).toBeGreaterThan(kg(weight));
    const plateau =
      history[0]?.sets.map((set) => ({
        weightKg: set.weight_kg ?? null,
        reps: set.reps ?? null,
      })) ?? [];
    for (let day = 19; day <= 21; day += 1) {
      history.unshift(train(day, plateau, { target }));
      expect(stalledSessions(history, "weight_reps")).toBe(day === 21 ? 3 : 0);
    }
  });

  it("compares stall gains within a set kind", () => {
    const lower = [{ weightKg: kg(weight), reps: 5 }];
    const flat = [3, 2, 1, 0].map((day) => train(day, lower));
    const top = train(4, [{ weightKg: kg(weight + step * 4), reps: 5 }]).sets;
    const mixed = {
      ...train(4, lower),
      sets: [...train(4, lower).sets, ...top.map((set) => ({ ...set, kind: "top" as const }))],
    };
    expect(stalledSessions([mixed, ...flat], "weight_reps")).toBe(4);
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
    const plates = [{ id: "micro", weightKg: exact(unit === "kg" ? 0.5 : 1.25), count: null }];
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

  it("sizes kit jumps in whole barbell steps before snapping", () => {
    const samples =
      unit === "kg"
        ? [
            [100, 102.5],
            [140, 142.5],
            [220, 225],
          ]
        : [[315, 320]];
    const plates = unit === "kg" ? [0.5, 1.25, 20] : [1.25, 45];
    const grid = barGrid(
      { weightKg: exact(unit === "kg" ? 20 : 45) },
      plates.map((plate) => ({ id: String(plate), weightKg: exact(plate), count: null })),
    );
    for (const [from = 0, to = 0] of samples) {
      const history = [
        train(
          0,
          plan.map(() => ({ weightKg: kg(from), reps: 8 })),
        ),
      ];
      const result = suggestNext(plan, history, "weight_reps", "barbell", settings, {
        now: new Date(START + DAY),
        grid,
      });
      expect(result?.sets[0]?.weightKg).toBeCloseTo(exact(to), 2);
    }
  });

  it("rounds a deload midpoint down with and without a grid", () => {
    const load = step * 15;
    const history = [
      train(
        0,
        plan.map(() => ({ weightKg: kg(load), reps: 8 })),
      ),
    ];
    const stack = rangeGrid([{ min: exact(step), max: null, step: exact(step) }]);
    for (const grid of [null, stack]) {
      const result = suggestNext(plan, history, "weight_reps", "machine", settings, {
        now: new Date(START + DAY),
        grid,
        deload: true,
      });
      expect(result?.sets[0]?.weightKg).toBeCloseTo(exact(step * 13), 2);
    }
  });

  it("shows the actual deload when the next lower pin would cut too far", () => {
    const load = unit === "kg" ? 15 : 30;
    const stack = rangeGrid([{ min: exact(load / 3), max: null, step: exact(load / 3) }]);
    const history = [
      train(
        0,
        plan.map(() => ({ weightKg: kg(load), reps: 8 })),
      ),
    ];
    const next = suggestNext(plan, history, "weight_reps", "machine", settings, {
      now: new Date(START + DAY),
      phaseLoad: 0.9,
      grid: stack,
    });
    expect(next?.sets[0]?.weightKg).toBeCloseTo(exact(load), 2);
    expect(next?.outcomes[0]?.loadFactor).toBeCloseTo(1, 3);
  });

  it("freezes Run weeks and replaces the first Test after a two-week break with Build", () => {
    const start = new Date(START).toISOString();
    const date = (day: number) => new Date(START + day * DAY);
    const run = {
      started_at: start,
      inserted_deloads: [],
      pauses: [{ from: date(6).toISOString(), until: date(20).toISOString() }],
    };
    const phasePlan = phasePlanSchema.parse({ pattern: ["build", "test", "deload"] });
    expect(runWeek(start, date(19), "UTC", run.pauses)).toBe(1);
    expect(runWeek(start, date(21), "UTC")).toBe(4);
    expect(runWeek(start, date(21), "UTC", run.pauses)).toBe(2);
    const returned = phaseFor(phasePlan, run, date(21), "UTC", [start]);
    expect(returned).toMatchObject({ week: 2, phase: "build" });
    expect(phaseFor(phasePlan, run, date(22), "UTC", [start, date(21).toISOString()])?.phase).toBe(
      "build",
    );
    expect(phaseFor(phasePlan, run, date(28), "UTC", [start, date(21).toISOString()])?.phase).toBe(
      "deload",
    );
  });

  it("seeds an RPE 8–9 Test single from e1RM, factors breaks and reads Test records", () => {
    const baseline = train(0, [{ weightKg: kg(weight), reps: 5 }]);
    const estimate = (kg(weight) * 36) / 32;
    const test = (history: readonly ContextSession[], day: number) =>
      testWorkingLoad(history, "weight_reps", {
        now: new Date(START + day * DAY),
        single: true,
      });
    expect(test([baseline], 7)).toBeCloseTo(estimate * 0.925, 5);
    expect(test([baseline], 18)).toBeCloseTo(estimate * 0.925 * 0.9, 5);
    const targets = applyPhase(plan, "test", {
      isMainLift: true,
      type: "weight_reps",
      equipment: "barbell",
      unit,
      testLoadKg: test([baseline], 7),
      testWorkups: true,
    });
    expect(targets.map(({ kind }) => kind)).toEqual(["warmup", "warmup", "top"]);
    expect(targets.at(-1)).toMatchObject({
      reps_min: 1,
      reps_max: 1,
      effort_min: 8,
      effort_max: 9,
    });
    const recordLoad = kg(weight + step * 5);
    const result = train(7, [{ weightKg: recordLoad, reps: 1 }], { phase: "test", rpe: 9 });
    const history = [result, baseline];
    expect(exerciseRecords(history).get("lift")?.get("estimated_one_rep_max")).toBe(recordLoad);
    expect(recordFlags(history).get("7-0")).toContain("reps_1");
    expect(test(history, 8)).toBeCloseTo(estimate * 0.925, 5);

    const unusable = [10, 9, 8].map((day) =>
      train(day, [{ weightKg: kg(weight - step), reps: 15 }]),
    );
    expect(test([...unusable.slice(1), baseline], 11)).toBeCloseTo(estimate * 0.925, 5);
    expect(test([...unusable, baseline], 11)).toBeCloseTo(kg(weight - step), 5);
    expect(test([baseline], 57)).toBeCloseTo(kg(weight) * 0.8, 5);
  });

  it("adjusts later sets on the grid after a miss and flags three missed Sessions as a stall", () => {
    const target: PlannedSet = { kind: "working", reps_min: 6, reps_max: 8 };
    const loads = adjustmentLoadsFor(
      { equipment: "machine", type: "weight_reps", unit },
      { unit, weightIncrementKg: null },
      grid,
    );
    const account = {
      unit,
      previousSource: "same_workout",
      weightIncrementKg: null,
      lighterWeeks: [],
      bodyweightKg: null,
      stallMemory: () => ({ dismissed: false, applied: false }),
    } as const;
    const history: ContextSession[] = [train(0, startingTargets, { target })];
    const verdict = () =>
      suggestionContext(
        [...history], // a fresh array: the watch result is immutable

        {
          exerciseId: "lift",
          sourceWorkoutExerciseId: "slot",
          exerciseOrdinal: 0,
          duplicateEntry: false,
          type: "weight_reps",
          equipment: "machine",
          workoutId,
          gymId: "home",
          grid,
          stalls: true,
          prescription: plan,
        },
        account,
      ).stall;
    for (let day = 2; day <= 8; day += 2) {
      const offered = propose(history, day)?.sets ?? [];
      const ids = offered.map((_, index) => `0192f0a0-0000-7000-8000-00000000${day}00${index}`);
      const snapshot = prescriptionSchema.parse({
        exerciseId: "0192f0a0-0000-7000-8000-000000000001",
        revision: "0192f0a0-0000-7000-8000-0000000000a1",
        previousRevision: null,
        reason: null,
        incrementKg: 0,
        breakDays: null,
        capKg: grid?.capKg ?? null,
        sets: offered.map((set, index) => ({
          id: ids[index],
          ghosts: { weight: set?.weightKg, reps: set?.reps },
          outcome: null,
        })),
      });
      // The first set misses by three reps: only the second, still unticked, is lowered.
      const adjusted = adjustPrescription(
        snapshot,
        ids[0] ?? "",
        { reps: (offered[0]?.reps ?? 0) - 3 },
        new Set([ids[1] ?? ""]),
        loads,
        true,
      );
      expect(adjusted?.sets[0]?.ghosts.weight).toBe(offered[0]?.weightKg);
      const lowered = adjusted?.sets[1]?.ghosts.weight ?? 0;
      expect(lowered).toBeLessThan(offered[1]?.weightKg ?? 0);
      expect(grid?.nearest(lowered)).toBeCloseTo(lowered, 3);
      const session = train(
        day,
        [
          { weightKg: offered[0]?.weightKg ?? 0, reps: (offered[0]?.reps ?? 0) - 3 },
          { weightKg: lowered, reps: offered[1]?.reps ?? 0 },
        ],
        { target },
      );
      session.sets = session.sets.map((set, index) => ({
        ...set,
        suggested: {
          weight_kg: offered[index]?.weightKg ?? null,
          reps: offered[index]?.reps ?? null,
        },
      }));
      history.unshift(session);
      // Both sets fell short of what was offered, Session after Session.
      expect(missedSuggestions(history)).toBe(day >= 6 ? day / 2 : 0);
      expect(verdict() === null).toBe(day < 6);
    }
  });

  it("flags missed suggestions while the numbers still improve", () => {
    const target: PlannedSet = { kind: "working", reps_min: 6, reps_max: 8 };
    const history: ContextSession[] = [];
    for (const [index, load] of [0, 1, 2, 3].entries()) {
      const session = train(
        index * 3,
        plan.map(() => ({ weightKg: kg(weight + step * load), reps: 6 })),
        { target },
      );
      // Each Session was offered one step more than it did.
      session.sets = session.sets.map((set) => ({
        ...set,
        suggested: { weight_kg: (set.weight_kg ?? 0) + exact(step), reps: 6 },
      }));
      history.unshift(session);
    }
    expect(stalledSessions(history, "weight_reps")).toBe(0);
    const { stall } = suggestionContext(
      history,
      {
        exerciseId: "lift",
        sourceWorkoutExerciseId: "slot",
        exerciseOrdinal: 0,
        duplicateEntry: false,
        type: "weight_reps",
        equipment: "machine",
        workoutId,
        gymId: "home",
        grid,
        stalls: true,
        prescription: plan,
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
    expect(stall).toMatchObject({ count: 4, missed: true, applied: false });
  });

  it("advances fixed reps across alternating Workouts without mixing range or effort targets", () => {
    const fixed: PlannedSet = { kind: "working", reps_min: 5, reps_max: 5 };
    const target: PlannedSet = { kind: "working", reps_min: 8, reps_max: 12 };
    const history = [train(0, [{ weightKg: kg(weight), reps: 5 }], { target: fixed })];
    const next = (day: number, workoutId: string, targets: PlannedSet[]) => {
      const { settings } = suggestionContext(
        [...history],
        {
          exerciseId: "lift",
          type: "weight_reps",
          equipment: "barbell",
          workoutId,
          gymId: null,
          grid: null,
          stalls: false,
          prescription: targets,
        },
        {
          unit,
          previousSource: "same_workout",
          weightIncrementKg: null,
          lighterWeeks: [],
          bodyweightKg: null,
          stallMemory: () => ({ dismissed: false }),
        },
      );
      return suggestNext(targets, history, "weight_reps", "barbell", settings, {
        ...settings,
        now: new Date(START + day * DAY),
      });
    };
    for (let day = 1; day < 8; day += 1) {
      const workout = day % 2 ? "alternate" : workoutId;
      const suggestion = next(day, workout, [fixed]);
      expect(suggestion?.sets[0]?.weightKg).toBeCloseTo(exact(weight + day * step), 2);
      history.unshift({
        ...train(day, suggestion?.sets ?? [], { target: fixed }),
        workoutId: workout,
      });
    }
    history.unshift({
      ...train(8, [{ weightKg: kg(weight + step * 20), reps: 5 }], {
        target: { ...fixed, effort_min: 6, effort_max: 6 },
      }),
      workoutId: "technique",
    });
    expect(next(9, workoutId, [fixed])?.sets[0]?.weightKg).toBeCloseTo(exact(weight + step * 8), 2);
    expect(next(9, workoutId, [target])?.sets[0]).toMatchObject({
      weightKg: expect.closeTo(exact(weight + step * 6), 2),
      reps: 6,
    });
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
