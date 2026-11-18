import { defaultGymKit } from "@workspace/shared";
import type { EquipmentRow } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import {
  canAddWarmups,
  firstWorkingWeightKg,
  rampKey,
  rampTargets,
  shouldAutoWarmup,
  warmupLoading,
} from "./warmup-plan";

let nextId = 0;
const kit = (unit: "kg" | "lb"): EquipmentRow[] =>
  defaultGymKit(unit).map((item) => ({
    id: `row-${nextId++}`,
    kind: item.kind,
    weightKg: item.weight_kg,
    unit: item.unit,
    label: item.label,
    count: null,
    enabled: true,
  }));

const set = (
  kind: "warmup" | "working",
  over: { weightKg?: number | null; done?: boolean } = {},
) => ({
  id: `set-${nextId++}`,
  kind,
  weightKg: over.weightKg ?? null,
  completedAt: over.done ? "2026-11-18T10:00:00Z" : null,
});
const squat = (barId: string | null = null) => ({
  type: "weight_reps" as const,
  barId,
  exercise: { equipment: "barbell" as const } as never,
});

describe("firstWorkingWeightKg", () => {
  it("prefers what is typed into the first working set, then its Ghost value", () => {
    const typed = { sets: [set("warmup"), set("working", { weightKg: 90 })] };
    expect(firstWorkingWeightKg(typed, () => 100)).toBe(90);
    const empty = { sets: [set("warmup", { weightKg: 20 }), set("working")] };
    expect(firstWorkingWeightKg(empty, () => 100)).toBe(100);
    expect(firstWorkingWeightKg(empty, () => null)).toBeNull();
  });

  it("is null with no working set", () => {
    expect(firstWorkingWeightKg({ sets: [set("warmup")] }, () => 50)).toBeNull();
  });
});

describe("rampTargets", () => {
  it("makes warm-up targets from the remembered bar and its plates", () => {
    const rows = kit("kg");
    const targets = rampTargets(squat(), 100, rows, "kg", null);
    expect(targets).toEqual([
      { kind: "warmup", weight_kg: 20, reps_min: 10, reps_max: 10 },
      { kind: "warmup", weight_kg: 50, reps_min: 5, reps_max: 5 },
      { kind: "warmup", weight_kg: 70, reps_min: 3, reps_max: 3 },
      { kind: "warmup", weight_kg: 85, reps_min: 1, reps_max: 1 },
    ]);
    const ez = rows.find((r) => r.kind === "bar" && r.label === "EZ");
    expect(rampTargets(squat(ez?.id ?? null), 100, rows, "kg", null)[0]?.weight_kg).toBe(10);
  });

  it("uses the step for a dumbbell exercise and none for a bodyweight one", () => {
    const dumbbell = { ...squat(), exercise: { equipment: "dumbbell" as const } as never };
    expect(rampTargets(dumbbell, 40, kit("kg"), "kg", 2.5).map((t) => t.weight_kg)).toEqual([
      15, 20, 27.5, 35,
    ]);
    expect(rampTargets({ ...squat(), type: "bodyweight_reps" }, 40, kit("kg"), "kg", 2.5)).toEqual(
      [],
    );
  });

  it("falls back to the step when there is no kit at all", () => {
    expect(rampTargets(squat(), 100, [], "kg", null)[0]?.weight_kg).toBe(40);
  });
});

describe("shouldAutoWarmup", () => {
  const base = { autoWarmups: true, type: "weight_reps" as const, sets: [set("working")] };
  it("needs the setting, a loaded lift and nothing ticked yet", () => {
    expect(shouldAutoWarmup(base)).toBe(true);
    expect(shouldAutoWarmup({ ...base, autoWarmups: false })).toBe(false);
    expect(shouldAutoWarmup({ ...base, type: "duration" })).toBe(false);
    expect(
      shouldAutoWarmup({ ...base, sets: [set("warmup", { done: true }), set("working")] }),
    ).toBe(false);
  });
  it("only loaded lifts can add warm-ups", () => {
    expect(canAddWarmups({ type: "weight_reps" })).toBe(true);
    expect(canAddWarmups({ type: "bodyweight_weighted_reps" })).toBe(false);
  });
});

describe("rampKey", () => {
  it("changes with the weight, the kit and the unit, not with identical inputs", () => {
    const rows = kit("kg");
    const key = rampKey(100, squat(), rows, "kg", null);
    expect(rampKey(100, squat(), [...rows], "kg", null)).toBe(key);
    expect(rampKey(102.5, squat(), rows, "kg", null)).not.toBe(key);
    expect(rampKey(100, squat(), rows.slice(0, 3), "kg", null)).not.toBe(key);
    expect(rampKey(100, squat(), rows, "lb", null)).not.toBe(key);
    expect(warmupLoading(squat(), rows, "kg", null).loading.bar?.weightKg).toBe(20);
  });
});
