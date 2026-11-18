import { describe, expect, it } from "vitest";

import { defaultGymKit } from "../plates/gym-kit";
import { KG_PER_LB } from "../vocabulary/format";
import { hasWarmupRamp, warmupRamp, type WarmupLoading } from "./warmup-ramp";

function kit(unit: "kg" | "lb", barIndex = 0): NonNullable<WarmupLoading["bar"]> {
  const items = defaultGymKit(unit);
  const bar = items.filter((i) => i.kind === "bar")[barIndex];
  return {
    weightKg: bar?.weight_kg ?? 0,
    plates: items
      .filter((i) => i.kind === "plate")
      .map((p, index) => ({ id: String(index), weightKg: p.weight_kg, count: null })),
  };
}

const lb = (kg: number) => Math.round((kg / KG_PER_LB) * 100) / 100;
const asKg = (ramp: ReturnType<typeof warmupRamp>) =>
  ramp.map((s) => [Math.round(s.weightKg * 1000) / 1000, s.reps]);
const asLb = (ramp: ReturnType<typeof warmupRamp>) => ramp.map((s) => [lb(s.weightKg), s.reps]);

const barbell = (workingKg: number, loading: WarmupLoading, unit: "kg" | "lb" = "kg") =>
  warmupRamp({ workingKg, exerciseType: "weight_reps", equipment: "barbell", unit, loading });

describe("warmupRamp on a barbell", () => {
  it("ramps bar x10, 50% x5, 70% x3, 85% x1 for 100 kg", () => {
    expect(asKg(barbell(100, { bar: kit("kg") }))).toEqual([
      [20, 10],
      [50, 5],
      [70, 3],
      [85, 1],
    ]);
  });

  it("rounds each step to a load the plates can make (62.5 kg)", () => {
    // 31.25, 43.75 and 53.125 are not loadable; 31, 43.5 and 53 are.
    expect(asKg(barbell(62.5, { bar: kit("kg") }))).toEqual([
      [20, 10],
      [31, 5],
      [43.5, 3],
      [53, 1],
    ]);
  });

  it("works in pounds: 225 lb gives bar, 110, 155, 190 (a 112.5 tie goes down)", () => {
    const working = 225 * KG_PER_LB;
    expect(asLb(barbell(working, { bar: kit("lb") }, "lb"))).toEqual([
      [45, 10],
      [110, 5],
      [155, 3],
      [190, 1],
    ]);
  });

  it("drops steps that round to the same load (60 kg with only 5 kg plates)", () => {
    const plates = [{ id: "a", weightKg: 5, count: null }];
    const ramp = asKg(barbell(60, { bar: { weightKg: 20, plates } }));
    // 50% = 30 -> 30 (tie goes down to 30), 70% = 42 -> 40, 85% = 51 -> 50
    expect(ramp).toEqual([
      [20, 10],
      [30, 5],
      [40, 3],
      [50, 1],
    ]);
  });

  it("collapses collisions with the bar on a light working weight", () => {
    // 40 kg: 50% = 20 (the bar again), 70% = 28, 85% = 34
    const ramp = asKg(barbell(40, { bar: kit("kg") }));
    expect(ramp[0]).toEqual([20, 10]);
    expect(ramp.filter(([kg]) => kg === 20)).toHaveLength(1);
    expect(ramp.at(-1)?.[1]).toBe(1);
  });

  it("never reaches or passes the working weight", () => {
    for (const working of [30, 42.5, 55, 80, 140, 200]) {
      for (const [kg] of asKg(barbell(working, { bar: kit("kg") }))) {
        expect(Number(kg)).toBeLessThan(working);
      }
    }
  });

  it("gives none when the working weight is the bar or within one step above it", () => {
    expect(barbell(20, { bar: kit("kg") })).toEqual([]);
    expect(barbell(20.5, { bar: kit("kg") })).toEqual([]);
    expect(barbell(21, { bar: kit("kg") })).toEqual([]);
    expect(barbell(15, { bar: kit("kg") })).toEqual([]);
    expect(barbell(22.5, { bar: kit("kg") })).not.toEqual([]);
  });

  it("uses the chosen bar (an EZ bar of 10 kg)", () => {
    const ramp = asKg(barbell(50, { bar: kit("kg", 2) }));
    expect(ramp[0]).toEqual([10, 10]);
  });

  it("falls back to 40% x10 when the barbell has no bar", () => {
    const ramp = asKg(barbell(100, { bar: null, stepKg: 2.5 }));
    expect(ramp).toEqual([
      [40, 10],
      [50, 5],
      [70, 3],
      [85, 1],
    ]);
  });

  it("uses a bare-bar kit (bar 0 kg) as a bar", () => {
    const loose = { weightKg: 0, plates: kit("kg").plates };
    expect(asKg(barbell(100, { bar: loose }))).toEqual([
      // bar of 0 kg is not a useful opener; the 50% step is the first
      [50, 5],
      [70, 3],
      [85, 1],
    ]);
  });
});

describe("warmupRamp on other equipment", () => {
  const ramp = (workingKg: number, equipment: "dumbbell" | "machine", stepKg: number | null) =>
    warmupRamp({
      workingKg,
      exerciseType: "weight_reps",
      equipment,
      unit: "kg",
      loading: { bar: null, stepKg },
    });

  it("rounds a dumbbell ramp to the step: 40 kg with 2.5 kg steps", () => {
    expect(asKg(ramp(40, "dumbbell", 2.5))).toEqual([
      [15, 10],
      [20, 5],
      [27.5, 3],
      [35, 1],
    ]);
  });

  it("ignores a bar for a machine and uses the default step when none is given", () => {
    const result = warmupRamp({
      workingKg: 100,
      exerciseType: "weight_reps",
      equipment: "machine",
      unit: "kg",
      loading: { bar: kit("kg") },
    });
    expect(asKg(result)).toEqual([
      [40, 10],
      [50, 5],
      [70, 3],
      [85, 1],
    ]);
  });

  it("defaults to a 5 lb step in pounds", () => {
    const result = warmupRamp({
      workingKg: 100 * KG_PER_LB,
      exerciseType: "weight_reps",
      equipment: "machine",
      unit: "lb",
      loading: { bar: null },
    });
    expect(asLb(result)).toEqual([
      [40, 10],
      [50, 5],
      [70, 3],
      [85, 1],
    ]);
  });

  it("drops colliding steps on a light dumbbell (10 kg)", () => {
    expect(asKg(ramp(10, "dumbbell", 2.5))).toEqual([
      [5, 10],
      [7.5, 3],
    ]);
  });

  it("gives none for tiny working weights", () => {
    expect(ramp(5, "dumbbell", 2.5)).toEqual([]);
    expect(ramp(4, "machine", 2)).toEqual([]);
    expect(ramp(0, "machine", 2.5)).toEqual([]);
  });

  it("falls back to the default step for a nonsense step", () => {
    expect(ramp(40, "dumbbell", -1)).toEqual(ramp(40, "dumbbell", null));
  });
});

describe("warmupRamp for types without a load to ramp", () => {
  it("gives none for bodyweight, weighted, assisted, timed and cardio types", () => {
    for (const exerciseType of [
      "reps_only",
      "bodyweight_reps",
      "bodyweight_assisted_reps",
      "bodyweight_weighted_reps",
      "duration",
      "distance_duration",
      "short_distance_weight",
      "floors_duration",
      "steps_duration",
    ] as const) {
      expect(hasWarmupRamp(exerciseType)).toBe(false);
      expect(
        warmupRamp({
          workingKg: 100,
          exerciseType,
          equipment: "barbell",
          unit: "kg",
          loading: { bar: kit("kg") },
        }),
      ).toEqual([]);
    }
  });

  it("skips a step whose nearest loadable load is far above its share (sparse kit)", () => {
    // A 20 kg bar with one pair each of 0.5 kg and 20 kg: only 20, 21, 60 and 61 can be made.
    const sparse = {
      weightKg: 20,
      plates: [
        { id: "a", weightKg: 0.5, count: 1 },
        { id: "b", weightKg: 20, count: 1 },
      ],
    };
    const steps = barbell(65, { bar: sparse });
    expect(asKg(steps)).toEqual([
      [20, 10],
      [21, 5],
    ]);
    for (const step of steps) {
      const share = step.reps === 5 ? 0.6 : step.reps === 3 ? 0.8 : 1;
      expect(step.weightKg).toBeLessThanOrEqual(65 * share + 1e-9);
    }
  });

  it("gives none for a non-finite or negative weight", () => {
    expect(barbell(Number.NaN, { bar: kit("kg") })).toEqual([]);
    expect(barbell(-10, { bar: kit("kg") })).toEqual([]);
  });
});
