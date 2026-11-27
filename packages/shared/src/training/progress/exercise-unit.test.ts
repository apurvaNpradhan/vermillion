import { expect, it } from "vitest";

import { warmupRamp } from "../logging/warmup-ramp";
import { applyPhase } from "../phases/phases";
import { defaultGymKit } from "../plates/gym-kit";
import { formatWeight, KG_PER_LB, parseWeight } from "../vocabulary/format";
import { resolveExerciseUnit, type WeightUnit } from "../vocabulary/vocabulary";
import { gymGridsOf } from "./gym-grids";
import { addLoad, incrementFor } from "./progression-steps";
import { suggestNext } from "../engine/pipeline";

it.each<[WeightUnit, WeightUnit | null | undefined, WeightUnit]>([
  ["kg", undefined, "kg"],
  ["lb", null, "lb"],
  ["kg", "kg", "kg"],
  ["lb", "lb", "lb"],
  ["kg", "lb", "lb"],
  ["lb", "kg", "kg"],
])("with preference %s and override %s, uses %s", (preferred, override, expected) => {
  expect(resolveExerciseUnit(preferred, override)).toBe(expected);
});

const cases = [
  {
    preferred: "kg",
    override: "lb",
    light: 22.5,
    fine: 2.5,
    last: 25,
    next: 30,
    bar: 45,
    load: 50,
    working: 50,
    warmup: ["20", "25", "35", "40"],
    cap: 29.9,
    capped: "29.5",
  },
  {
    preferred: "lb",
    override: "kg",
    light: 9,
    fine: 1,
    last: 10,
    next: 12.5,
    bar: 20,
    load: 22.5,
    working: 25,
    warmup: ["10", "12.5", "17.5", "20"],
    cap: 12.4,
    capped: "12.25",
  },
] satisfies {
  preferred: WeightUnit;
  override: WeightUnit;
  light: number;
  fine: number;
  last: number;
  next: number;
  bar: number;
  load: number;
  working: number;
  warmup: string[];
  cap: number;
  capped: string;
}[];

const targets = [{ kind: "working" as const, reps_min: 8, reps_max: 12 }];
const id = "exercise";
const now = new Date("2026-11-16T12:00:00Z");

it.each(cases)("uses the $override rack and progression for a $preferred lifter", (example) => {
  const unit = resolveExerciseUnit(example.preferred, example.override);
  const stored = (load: number) => load * (unit === "lb" ? KG_PER_LB : 1);
  const loads = gymGridsOf({ settings: [], kit: [], unit: example.preferred });
  const grid = loads.gridFor(id, "dumbbell", example.override);
  const settings = { weightUnit: unit, weightIncrementKg: null };
  expect(grid?.stepAt(stored(example.light))).toBeCloseTo(stored(example.fine));
  expect(incrementFor(stored(example.last), "dumbbell", settings, grid)).toBeCloseTo(
    stored(example.next - example.last),
  );
  const suggestion = suggestNext(
    targets,
    [
      {
        started_at: now.toISOString(),
        sets: [
          {
            id: "set",
            exercise_id: id,
            exercise_type: "weight_reps",
            kind: "working",
            completed_at: now.toISOString(),
            weight_kg: stored(example.last),
            // The extended ceiling: the jump to the next rack weight is earned.
            reps: 18,
          },
        ],
      },
    ],
    "weight_reps",
    "dumbbell",
    settings,
    { now, grid },
  );
  expect(suggestion?.sets[0]?.weightKg).toBeCloseTo(stored(example.next), 3);
  expect(suggestion?.reason).toBe("add_weight");
});

it.each(cases)("rounds warm-ups on the $override rack for a $preferred lifter", (example) => {
  const unit = resolveExerciseUnit(example.preferred, example.override);
  const workingKg = example.working * (unit === "lb" ? KG_PER_LB : 1);
  const grid = gymGridsOf({ settings: [], kit: [], unit: example.preferred }).gridFor(
    id,
    "dumbbell",
    example.override,
  );
  const ramp = warmupRamp({
    workingKg,
    exerciseType: "weight_reps",
    equipment: "dumbbell",
    unit,
    loading: { bar: null, grid },
  });
  expect(ramp.map((set) => formatWeight(set.weightKg, unit))).toEqual(example.warmup);
});

it.each(cases)("uses the $override bar for a $preferred lifter's Deload and Test", (example) => {
  const unit = resolveExerciseUnit(example.preferred, example.override);
  const kit = [example.preferred, unit].flatMap((unit) =>
    defaultGymKit(unit).map((item, index) => ({
      id: `${unit}-${index}`,
      kind: item.kind,
      weightKg: item.weight_kg,
      unit,
      label: item.label ?? null,
      count: null,
      enabled: true,
    })),
  );
  const remembered = kit.find((item) => item.kind === "bar" && item.unit === example.preferred);
  const loads = gymGridsOf({
    settings: [],
    kit,
    unit: example.preferred,
    bars: remembered ? new Map([[id, remembered.id]]) : undefined,
  });
  const grid = loads.gridFor(id, "barbell", example.override);
  const weight = parseWeight(String(example.load), unit) ?? 0;
  const plan = [{ ...targets[0], kind: "working" as const, weight_kg: weight }];
  const options = {
    isMainLift: true,
    type: "weight_reps",
    equipment: "barbell",
    unit,
    grid,
  } as const;
  const [deload] = applyPhase(plan, "deload", options);
  const [test] = applyPhase(plan, "test", { ...options, testLoadKg: weight });
  expect(formatWeight(deload?.weight_kg ?? 0, unit)).toBe(String(example.bar));
  expect(formatWeight(test?.weight_kg ?? 0, unit)).toBe(String(example.load));
});

it.each(cases)("keeps $override loads and their rounded displays within the cap", (example) => {
  const unit = resolveExerciseUnit(example.preferred, example.override);
  const cap = example.cap * (unit === "lb" ? KG_PER_LB : 1);
  const loads = gymGridsOf({ unit: example.preferred, settings: [], kit: [], dumbbellMaxKg: cap });
  const grid = loads.gridFor(id, "dumbbell", example.override);
  const workingKg = 120;
  const ramp = warmupRamp({
    workingKg,
    exerciseType: "weight_reps",
    equipment: "dumbbell",
    unit,
    loading: { bar: null, grid },
  });
  for (const step of ramp) {
    expect(step.weightKg).toBeLessThanOrEqual(cap);
    expect(parseWeight(formatWeight(step.weightKg, unit), unit)).toBeLessThanOrEqual(cap);
  }
  const at = example.last * (unit === "lb" ? KG_PER_LB : 1);
  const added = addLoad(at, 20, unit, grid);
  expect(added).not.toBeNull();
  expect(formatWeight(added ?? 0, unit)).toBe(example.capped);
  expect(added).toBeLessThanOrEqual(cap);
  const [target] = applyPhase([{ kind: "working", weight_kg: 50 }], "test", {
    isMainLift: true,
    type: "weight_reps",
    equipment: "dumbbell",
    unit,
    grid,
  });
  expect(target?.weight_kg).toBeLessThanOrEqual(cap);
  expect(parseWeight(formatWeight(target?.weight_kg ?? 0, unit), unit)).toBeLessThanOrEqual(cap);
});

it.each([
  { unit: "kg", bar: 20, test: 30 },
  { unit: "lb", bar: 45, test: 70 },
] as const)("keeps typed $unit rack points in Test and the empty bar in Deload", (example) => {
  const { unit } = example;
  const kit = defaultGymKit(unit).map((item, index) => ({
    id: String(index),
    kind: item.kind,
    weightKg: item.weight_kg,
    unit,
    label: item.label ?? null,
    count: null,
    enabled: true,
  }));
  const grid = gymGridsOf({ settings: [], kit, unit }).gridFor(id, "barbell");
  const options = {
    isMainLift: true,
    type: "weight_reps",
    equipment: "barbell",
    unit,
    grid,
  } as const;
  for (const [phase, entered, shown] of [
    ["test", example.test, example.test],
    ["deload", example.bar, example.bar],
    ["deload", example.bar - 1, example.bar],
  ] as const) {
    const weight = parseWeight(String(entered), unit) ?? 0;
    const [set] = applyPhase([{ kind: "working", weight_kg: weight }], phase, options);
    expect(formatWeight(set?.weight_kg ?? 0, unit)).toBe(String(shown));
  }
});
