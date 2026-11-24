import { describe, expect, it } from "vitest";

import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { barGrid, rangeGrid, type LoadRange } from "./load-grid";
import { suggestNext, type ProgressionContext } from "./progression";
import { defaultGymKit } from "../plates/gym-kit";

const NOW = new Date("2026-11-16T12:00:00Z");
const settings = { weightUnit: "kg", weightIncrementKg: null } as const;
const plan: PlannedSet[] = [0, 1].map(() => ({ kind: "working", reps_min: 8, reps_max: 12 }));
const logged = (reps: number, weight: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  id: "s",
  exercise_id: "e",
  exercise_type: "weight_reps",
  kind: "working",
  completed_at: "2026-11-01",
  reps,
  weight_kg: weight,
  ...extra,
});
const stack: LoadRange[] = [{ min: 1, max: 91, step: 1 }];
const pins: LoadRange[] = [{ min: 5, max: 90, step: 5 }];

const suggest = (
  last: LoggedSet[],
  context: Partial<ProgressionContext> = {},
  equipment: Parameters<typeof suggestNext>[3] = "machine",
  older: LoggedSet[] = [],
) =>
  suggestNext(
    plan,
    [
      { started_at: "2026-11-13T10:00:00Z", sets: last },
      ...(older.length ? [{ started_at: "2026-11-10T10:00:00Z", sets: older }] : []),
    ],
    "weight_reps",
    equipment,
    settings,
    { now: NOW, ...context },
  );
const weights = (result: ReturnType<typeof suggest>) => result?.sets.map((set) => set?.weightKg);
const reps = (result: ReturnType<typeof suggest>) => result?.sets.map((set) => set?.reps);

describe("a cap on the load", () => {
  it("never suggests above the cap", () => {
    const next = suggest([logged(12, 88), logged(12, 88)], { grid: rangeGrid(pins) });
    expect(weights(next)).toEqual([90, 90]);
    expect(next?.reason).toBe("add_weight");
  });

  it("suggests the cap when the step would overshoot it by less than a step", () => {
    const next = suggest([logged(12, 90), logged(12, 90)], {
      grid: rangeGrid([{ min: 10, max: 95, step: 10 }]),
    });
    expect(weights(next)).toEqual([95, 95]);
  });

  it("an easy doubled add stops at the cap", () => {
    const next = suggest([logged(12, 85, { rpe: 6 }), logged(12, 85, { rpe: 6 })], {
      grid: rangeGrid(pins),
    });
    expect(weights(next)).toEqual([90, 90]);
  });

  it("an easy set adds two steps on the grid", () => {
    const next = suggest([logged(12, 40, { rpe: 6 }), logged(12, 40, { rpe: 6 })], {
      grid: rangeGrid(pins),
    });
    expect(weights(next)).toEqual([50, 50]);
    expect(next?.incrementKg).toBe(10);
  });

  it("at the cap keeps adding reps past the range's top", () => {
    const next = suggest([logged(12, 91), logged(12, 91)], { grid: rangeGrid(stack) });
    expect(next?.reason).toBe("add_rep");
    expect(weights(next)).toEqual([91, 91]);
    expect(reps(next)).toEqual([13, 13]);
  });

  it.each([
    { max: 12, extended: 18 },
    { max: 10, extended: 15 },
    { max: 8, extended: 12 },
    { max: 5, extended: 8 },
    { max: 1, extended: 2 },
  ])("grows reps to $extended when the range tops at $max, then hints", ({ max, extended }) => {
    const target: PlannedSet[] = [{ kind: "working", reps_min: 1, reps_max: max }];
    const run = (done: number) =>
      suggestNext(
        target,
        [{ started_at: "2026-11-13T10:00:00Z", sets: [logged(done, 91)] }],
        "weight_reps",
        "machine",
        settings,
        { now: NOW, grid: rangeGrid(stack) },
      );
    expect(run(extended - 1)).toMatchObject({ reason: "add_rep", sets: [{ reps: extended }] });
    expect(run(extended)).toMatchObject({
      reason: "cap_hint",
      sets: [{ weightKg: 91, reps: extended }],
    });
    expect(run(extended + 3)?.reason).toBe("cap_hint");
  });

  it("below the range's top at the cap is the usual rep climb", () => {
    const next = suggest([logged(9, 91), logged(9, 91)], { grid: rangeGrid(stack) });
    expect(next?.reason).toBe("add_rep");
    expect(reps(next)).toEqual([10, 10]);
  });

  it("a grind at the cap still holds for effort", () => {
    const next = suggest([logged(15, 91, { rpe: 9.5 }), logged(15, 91, { rpe: 9.5 })], {
      grid: rangeGrid(stack),
    });
    expect(next?.reason).toBe("hold_effort");
  });

  it("suggests the cap, with a capped reason, when the last load was above it", () => {
    const next = suggest([logged(10, 100), logged(10, 100)], { grid: rangeGrid(stack) });
    expect(next).toMatchObject({
      reason: "capped",
      sets: [
        { weightKg: 91, reps: 10 },
        { weightKg: 91, reps: 10 },
      ],
    });
  });

  it("a lighter break load never exceeds the cap", () => {
    const next = suggestNext(
      plan,
      [{ started_at: "2026-11-01T10:00:00Z", sets: [logged(10, 100), logged(10, 100)] }],
      "weight_reps",
      "machine",
      settings,
      { now: NOW, grid: rangeGrid([{ min: 5, max: 85, step: 5 }]) },
    );
    expect(next?.reason).toBe("after_break");
    expect(weights(next)).toEqual([85, 85]);
  });

  it("does nothing to bodyweight reps or an uncapped grid", () => {
    const uncapped = suggest([logged(12, 40), logged(12, 40)], {
      grid: rangeGrid([{ min: 5, max: null, step: 5 }]),
    });
    expect(weights(uncapped)).toEqual([45, 45]);
    const none = suggest([logged(12, 80), logged(12, 80)], {}, "barbell");
    expect(weights(none)).toEqual([82.5, 82.5]);
  });
});

describe("a gym's grid in suggestions", () => {
  it("adds one stack pin, not a fraction of one", () => {
    const next = suggest([logged(12, 40), logged(12, 40)], { grid: rangeGrid(pins) });
    expect(weights(next)).toEqual([45, 45]);
    expect(next?.incrementKg).toBe(5);
  });

  it("a barbell goes to a load the gym's plates can make", () => {
    const home = defaultGymKit("kg", "home_barbell").flatMap((item, index) =>
      item.kind === "plate" ? [{ id: `h${index}`, weightKg: item.weight_kg, count: 1 }] : [],
    );
    const next = suggest(
      [logged(12, 80), logged(12, 80)],
      { grid: barGrid({ weightKg: 20 }, home) },
      "barbell",
    );
    // Pairs of 1.25 kg plates: 2.5 kg a step.
    expect(weights(next)).toEqual([82.5, 82.5]);
  });

  it("a barbell kit without small plates steps by its smallest pair", () => {
    const next = suggest(
      [logged(12, 80), logged(12, 80)],
      { grid: barGrid({ weightKg: 20 }, [{ id: "a", weightKg: 5, count: null }]) },
      "barbell",
    );
    expect(weights(next)).toEqual([90, 90]);
  });

  it("a default dumbbell adds 2.5 kg above 10 kg and 1 kg below", () => {
    const heavy = suggestNext(
      plan,
      [{ started_at: "2026-11-13T10:00:00Z", sets: [logged(12, 30), logged(12, 30)] }],
      "weight_reps",
      "dumbbell",
      settings,
      { now: NOW },
    );
    expect(weights(heavy)).toEqual([32.5, 32.5]);
    const light = suggestNext(
      plan,
      [{ started_at: "2026-11-13T10:00:00Z", sets: [logged(12, 6), logged(12, 6)] }],
      "weight_reps",
      "dumbbell",
      settings,
      { now: NOW },
    );
    expect(weights(light)).toEqual([7, 7]);
  });
});
