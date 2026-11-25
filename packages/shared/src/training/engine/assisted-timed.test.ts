import { describe, expect, it } from "vitest";

import type { ExerciseType } from "../../exercise/vocabulary";
import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { rangeGrid } from "../progress/load-grid";
import type { SuggestedSet } from "../progress/progression";
import { stalledSessions } from "../progress/stalled-lift";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import { suggestNext } from "./pipeline";
import { prescribe } from "./prescribe";
import type { RuleConfig } from "./rule-config";

const DAY = 86_400_000;
const START = Date.parse("2026-01-01T12:00:00Z");

type Entry = {
  weightKg?: number | null;
  reps?: number | null;
  durationS?: number;
  distanceM?: number;
};

/** A finished Session of one exercise: each entry is a ticked working set. */
function session(day: number, type: ExerciseType, entries: readonly Entry[], target: PlannedSet) {
  const at = new Date(START + day * DAY).toISOString();
  return {
    id: `s${day}`,
    started_at: at,
    sets: entries.map((entry, index): LoggedSet => ({
      id: `${day}-${index}`,
      exercise_id: "lift",
      exercise_type: type,
      kind: "working",
      completed_at: at,
      weight_kg: entry.weightKg ?? null,
      reps: entry.reps ?? null,
      duration_s: entry.durationS ?? null,
      distance_m: entry.distanceM ?? null,
      target,
    })),
  };
}

describe.each([
  { unit: "kg", pin: 5, start: 30, top: 80 },
  { unit: "lb", pin: 10, start: 60, top: 180 },
] as const)("assisted lifts in $unit", ({ unit, pin, start, top }) => {
  const kg = (value: number) => parseWeight(String(value), unit) ?? 0;
  const settings = { weightUnit: unit, weightIncrementKg: null };
  const target: PlannedSet = { kind: "working", reps_min: 6, reps_max: 10 };
  const plan: PlannedSet[] = [target, target];
  const grid = rangeGrid([{ min: kg(pin), max: kg(top), step: kg(pin) }]);
  const ask = (history: ReturnType<typeof session>[], day: number) =>
    suggestNext(plan, history, "bodyweight_assisted_reps", "machine", settings, {
      now: new Date(START + day * DAY),
      grid,
    });
  const done = (day: number, assist: number, reps: number) =>
    session(
      day,
      "bodyweight_assisted_reps",
      [
        { weightKg: kg(assist), reps },
        { weightKg: kg(assist), reps },
      ],
      target,
    );

  it("adds reps first, then takes one pin of help away and starts from the bottom of the range", () => {
    const mid = ask([done(0, start, 8)], 2);
    expect(mid?.reason).toBe("add_rep");
    expect(mid?.sets[0]).toEqual({ weightKg: kg(start), reps: 9 });
    const topped = ask([done(0, start, 10)], 2);
    expect(topped?.reason).toBe("less_assist");
    expect(topped?.sets[0]).toEqual({ weightKg: kg(start - pin), reps: 6 });
    expect(topped?.outcomes[0]).toMatchObject({
      reason: "less_assist",
      changeKg: expect.closeTo(kg(pin), 3),
    });
  });

  it("never adds help in 20 Sessions, ends at none, and keeps reps climbing without a stall", () => {
    const history = [done(0, start, 6)];
    let assist: number = start;
    for (let day = 1; day <= 40; day += 1) {
      const result = ask(history, day * 2);
      if (!result) throw new Error("Expected a suggestion");
      const next = result.sets[0];
      const weight = (next?.weightKg ?? 0) / (unit === "kg" ? 1 : KG_PER_LB);
      expect(weight).toBeLessThanOrEqual(assist + 0.01);
      assist = weight;
      if (weight > 0.01)
        expect(grid?.nearest(next?.weightKg ?? 0)).toBeCloseTo(next?.weightKg ?? 0, 3);
      history.unshift(done(day * 2, Math.round(weight * 100) / 100, next?.reps ?? 0));
      expect(stalledSessions(history, "bodyweight_assisted_reps")).toBe(0);
    }
    expect(assist).toBe(0);
    // With no help left the reps went on past the top of the range.
    expect(history[0]?.sets[0]?.reps).toBeGreaterThan(10);
    const finished = ask(history, 82);
    expect(finished?.reason).toBe("add_rep");
    expect(finished?.sets[0]?.weightKg).toBe(0);
  });

  it("keeps the help after a break and only brings the reps back down", () => {
    const result = ask([done(0, start - pin, 10)], 30);
    expect(result?.reason).toBe("after_break");
    expect(result?.sets[0]).toEqual({ weightKg: kg(start - pin), reps: 6 });
    expect(result?.outcomes[0]?.loadFactor).toBeUndefined();
  });
});

describe("timed work", () => {
  const settings = { weightUnit: "kg", weightIncrementKg: null } as const;
  const hold: PlannedSet = { kind: "working", duration_s: 30 };
  const plan: PlannedSet[] = [hold, hold, hold];
  /** One Session of the plank, each set held for the seconds given (the same for all, or each). */
  const held = (day: number, seconds: number | readonly number[]) => {
    const each = [seconds].flat();
    return session(
      day,
      "duration",
      plan.map((_, index) => ({ durationS: each[index] ?? each[0] ?? 0 })),
      hold,
    );
  };
  const ask = (history: ReturnType<typeof session>[], day: number, config?: RuleConfig) =>
    suggestNext(
      plan,
      history,
      "duration",
      "none",
      settings,
      { now: new Date(START + day * DAY) },
      config,
    );

  it("adds five seconds to every set that was made, for 20 Sessions", () => {
    const history = [held(0, 30)];
    for (let day = 1; day <= 20; day += 1) {
      const result = ask(history, day * 2);
      expect(result?.reason).toBe("add_time");
      expect(result?.outcomes[0]).toMatchObject({ reason: "add_time", changeS: 5 });
      const expected = 30 + day * 5;
      expect(result?.sets.map((set) => set?.durationS)).toEqual([expected, expected, expected]);
      history.unshift(held(day * 2, expected));
    }
  });

  it("asks for the target again after a set that fell short, then builds from there", () => {
    const history = [held(0, [30, 25, 30])];
    const retry = ask(history, 2);
    expect(retry?.reason).toBe("hold_target");
    expect(retry?.sets.map((set) => set?.durationS)).toEqual([30, 30, 30]);
    history.unshift(held(2, 30));
    expect(ask(history, 4)?.sets[0]?.durationS).toBe(35);
  });

  it("judges a hold against the target it was made for, not today's plan", () => {
    const longer: PlannedSet[] = [
      { kind: "working", duration_s: 45 },
      { kind: "working", duration_s: 45 },
      { kind: "working", duration_s: 45 },
    ];
    const result = suggestNext(longer, [held(0, 30)], "duration", "none", settings, {
      now: new Date(START + 2 * DAY),
    });
    expect(result?.reason).toBe("add_time");
    expect(result?.sets[0]?.durationS).toBe(35);
  });

  it("takes a break's cut off the time, in whole five seconds", () => {
    // 16 days: 90% of 60 s is 54, in whole fives 55. 30 days: 80%, 48, so 50.
    const result = ask([held(0, 60)], 16);
    expect(result?.reason).toBe("after_break");
    expect(result?.sets[0]?.durationS).toBe(55);
    expect(ask([held(0, 60)], 30)?.sets[0]?.durationS).toBe(50);
    expect(ask([held(0, 60)], 16, { id: "maintain" })?.sets[0]?.durationS).toBe(55);
  });

  it("leaves a maintained hold as it was", () => {
    const result = ask([held(0, 40)], 2, { id: "maintain" });
    expect(result?.reason).toBe("same_as_last");
    expect(result?.sets.map((set) => set?.durationS)).toEqual([40, 40, 40]);
  });

  it("is the same for Session, preview and notification through prescribe()", () => {
    const history = [held(0, 30)].map((item) => ({
      ...item,
      workoutId: "w",
      gymId: null,
      finished_at: item.started_at,
    }));
    const result = prescribe({
      place: {
        exerciseId: "lift",
        sourceWorkoutExerciseId: "plan-lift",
        type: "duration",
        equipment: "none",
        workoutId: "w",
        gymId: null,
        grid: null,
        stalls: true,
      },
      plan,
      history,
      account: {
        previousSource: "same_workout",
        unit: "kg",
        weightIncrementKg: null,
        lighterWeeks: [],
        bodyweightKg: null,
        stallMemory: () => ({ dismissed: false }),
      },
      now: new Date(START + 2 * DAY),
    });
    expect(result.progression?.sets[0]).toMatchObject({ durationS: 35 });
    expect(result.stall).toBeNull();
  });
});

describe.each([
  { unit: "kg", carried: 20, next: 22.5, steps: "2.5" },
  { unit: "lb", carried: 45, next: 50, steps: "5" },
] as const)("carries in $unit", ({ unit, carried, next }) => {
  const kg = (value: number) => parseWeight(String(value), unit) ?? 0;
  const settings = { weightUnit: unit, weightIncrementKg: null };
  const lap: PlannedSet = { kind: "working", distance_m: 20 };
  const plan: PlannedSet[] = [lap, lap];
  const walked = (day: number, weight: number | null, metres: number) =>
    session(
      day,
      "short_distance_weight",
      [
        { weightKg: weight === null ? null : kg(weight), distanceM: metres },
        { weightKg: weight === null ? null : kg(weight), distanceM: metres },
      ],
      lap,
    );
  const ask = (history: ReturnType<typeof session>[], day: number) =>
    suggestNext(plan, history, "short_distance_weight", "dumbbell", settings, {
      now: new Date(START + day * DAY),
    });

  it("adds a step of load once the distance was made, keeping the distance", () => {
    const result = ask([walked(0, carried, 20)], 2);
    expect(result?.reason).toBe("add_weight");
    expect(result?.sets[0]).toMatchObject({ weightKg: expect.closeTo(kg(next), 3), distanceM: 20 });
  });

  it("holds the load and asks for the distance again when it fell short", () => {
    const result = ask([walked(0, carried, 15)], 2);
    expect(result?.reason).toBe("hold_target");
    expect(result?.sets[0]).toMatchObject({ weightKg: kg(carried), distanceM: 20 });
  });

  it("adds five metres to a carry with no load", () => {
    const result = ask([walked(0, null, 20)], 2);
    expect(result?.reason).toBe("add_distance");
    expect(result?.outcomes[0]).toMatchObject({ reason: "add_distance", changeM: 5 });
    expect(result?.sets[0]).toMatchObject({ weightKg: null, distanceM: 25 });
  });

  it("climbs for 12 Sessions and keeps its loads whole", () => {
    const history = [walked(0, carried, 20)];
    let weight = carried;
    for (let day = 1; day <= 12; day += 1) {
      const result = ask(history, day * 2);
      const value = (result?.sets[0]?.weightKg ?? 0) / (unit === "kg" ? 1 : KG_PER_LB);
      expect(value).toBeGreaterThan(weight);
      weight = Math.round(value * 100) / 100;
      history.unshift(walked(day * 2, weight, 20));
    }
    expect(weight).toBeGreaterThan(carried * 1.5);
  });

  it("is a SuggestedSet that ghosts can read", () => {
    const suggestion: SuggestedSet | null | undefined = ask([walked(0, carried, 20)], 2)?.sets[0];
    expect(suggestion?.distanceM).toBe(20);
  });
});
