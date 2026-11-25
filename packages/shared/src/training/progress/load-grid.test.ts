import { describe, expect, it } from "vitest";

import { defaultGymKit } from "../plates/gym-kit";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import {
  barGrid,
  gymRangesFor,
  limitsOfRanges,
  loadBasisOf,
  loadGridOf,
  loadRangesSchema,
  rangeGrid,
  rangesFromLimits,
  type LoadRange,
} from "./load-grid";
import {
  addLoad,
  defaultRangesFor,
  incrementFor,
  lightenLoad,
  loadable,
} from "./progression-steps";

const settings = { weightUnit: "kg", weightIncrementKg: null } as const;
const stack: LoadRange[] = [{ min: 5, max: 90, step: 5 }];
const jumpStack: LoadRange[] = [
  { min: 15, max: 25, step: 5 },
  { min: 25, max: 55, step: 10 },
];
const rack: LoadRange[] = [
  { min: 1, max: 10, step: 1 },
  { min: 12.5, max: null, step: 2.5 },
];
const kit = defaultGymKit("kg", "gym");
// Without the 0.5 kg pair, so the smallest step is 2.5 kg.
const plates = kit.flatMap((item, index) =>
  item.kind === "plate" && item.weight_kg >= 1.25
    ? [{ id: `p${index}`, weightKg: item.weight_kg, count: item.count }]
    : [],
);
const homePlates = defaultGymKit("kg", "home_barbell").flatMap((item, index) =>
  item.kind === "plate" ? [{ id: `h${index}`, weightKg: item.weight_kg, count: item.count }] : [],
);

describe("range grid", () => {
  const grid = (ranges: LoadRange[]) => {
    const made = rangeGrid(ranges);
    if (!made) throw new Error("no grid");
    return made;
  };

  it("has no grid without ranges", () => {
    expect(rangeGrid([])).toBeNull();
  });

  it.each([
    { name: "stack", ranges: stack, kg: 42, nearest: 40, above: 45, below: 40 },
    { name: "stack, on a pin", ranges: stack, kg: 45, nearest: 45, above: 50, below: 40 },
    { name: "stack, under the first", ranges: stack, kg: 2, nearest: 5, above: 5, below: null },
    { name: "stack, over the cap", ranges: stack, kg: 120, nearest: 90, above: null, below: 90 },
    { name: "stack, at the cap", ranges: stack, kg: 90, nearest: 90, above: null, below: 85 },
    { name: "stack, tie goes lower", ranges: stack, kg: 42.5, nearest: 40, above: 45, below: 40 },
    { name: "jump stack, first run", ranges: jumpStack, kg: 21, nearest: 20, above: 25, below: 20 },
    { name: "jump stack, the jump", ranges: jumpStack, kg: 25, nearest: 25, above: 35, below: 20 },
    {
      name: "jump stack, second run",
      ranges: jumpStack,
      kg: 41,
      nearest: 45,
      above: 45,
      below: 35,
    },
    { name: "rack, fine run", ranges: rack, kg: 7.4, nearest: 7, above: 8, below: 7 },
    { name: "rack, the jump", ranges: rack, kg: 10, nearest: 10, above: 12.5, below: 9 },
    { name: "rack, coarse run", ranges: rack, kg: 31, nearest: 30, above: 32.5, below: 30 },
  ])("$name: $kg kg", ({ ranges, kg, nearest, above, below }) => {
    const made = grid(ranges);
    expect(made.nearest(kg)).toBe(nearest);
    expect(made.above(kg)).toBe(above);
    expect(made.below(kg)).toBe(below);
  });

  it.each([
    { ranges: stack, kg: 40, step: 5 },
    { ranges: jumpStack, kg: 20, step: 5 },
    { ranges: jumpStack, kg: 25, step: 10 },
    { ranges: jumpStack, kg: 60, step: 10 },
    { ranges: rack, kg: 9, step: 1 },
    { ranges: rack, kg: 20, step: 2.5 },
  ])("steps by $step at $kg kg", ({ ranges, kg, step }) => {
    expect(grid(ranges).stepAt(kg)).toBe(step);
  });

  it.each([
    { unit: "kg", factor: 1 },
    { unit: "lb", factor: KG_PER_LB },
  ])("keeps a rack's points when capped at a range boundary in $unit", ({ factor }) => {
    const ranges = rack.map(({ min, max, step }) => ({
      min: min * factor,
      max: (max ?? 30) * factor,
      step: (step ?? 0) * factor,
    }));
    const capped = rangesFromLimits({ maxKg: 12.5 * factor, stepKg: 2.5 * factor }, ranges);
    const made = grid(capped);
    for (let load = 1; load <= 10; load += 1) {
      expect(made.nearest(load * factor)).toBeCloseTo(load * factor, 5);
    }
    expect(made.above(10 * factor)).toBeCloseTo(12.5 * factor, 5);
    expect(made.below(12.5 * factor)).toBeCloseTo(10 * factor, 5);
    expect(made.above(12.5 * factor)).toBeNull();
  });

  it("takes the cap from the last range only", () => {
    expect(grid(stack).capKg).toBe(90);
    expect(grid(jumpStack).capKg).toBe(55);
    expect(grid(rack).capKg).toBeNull();
  });
});

describe("bar grid", () => {
  it("loads pairs of the gym's plates over the bar", () => {
    const grid = barGrid({ weightKg: 20 }, plates);
    expect(grid?.nearest(81)).toBe(80);
    expect(grid?.nearest(81.5)).toBe(82.5);
    expect(grid?.above(80)).toBe(82.5);
    expect(grid?.below(80)).toBe(77.5);
    expect(grid?.stepAt(80)).toBe(2.5);
  });

  it("a home kit without a 0.5 kg plate steps by its smallest pair", () => {
    const grid = barGrid({ weightKg: 20 }, homePlates);
    expect(grid?.above(100)).toBe(102.5);
    expect(grid?.nearest(101)).toBe(100);
  });

  it("cannot go under the bar", () => {
    expect(barGrid({ weightKg: 20 }, plates)?.below(20)).toBeNull();
  });

  it.each([
    { unit: "kg", bar: 20, plate: 2.5 },
    { unit: "lb", bar: 45 * KG_PER_LB, plate: 5 * KG_PER_LB },
  ] as const)("has no grid for a $unit bar without enabled plates", ({ unit, bar, plate }) => {
    const input = { equipment: "barbell", unit, bar: { weightKg: bar } } as const;
    expect(loadGridOf(input)).toBeNull();
    expect(
      loadGridOf({ ...input, plates: [{ id: "disabled", weightKg: plate, count: 0 }] }),
    ).toBeNull();
  });

  it("limits the loads to the plates that exist", () => {
    const grid = barGrid({ weightKg: 20 }, [{ id: "a", weightKg: 10, count: 1 }]);
    expect(grid?.above(40)).toBeNull();
    expect(grid?.nearest(100)).toBe(40);
  });
});

describe("loadGridOf", () => {
  const bar = { weightKg: 20 };

  it.each([
    {
      name: "a machine's own ranges",
      input: { equipment: "machine", ranges: stack },
      source: "gym",
    },
    {
      name: "a barbell's own ranges over its kit",
      input: { equipment: "barbell", ranges: stack, bar, plates },
      source: "gym",
    },
    {
      name: "a barbell without ranges, its kit",
      input: { equipment: "barbell", ranges: [], bar, plates },
      source: "kit",
    },
    {
      name: "a dumbbell without ranges, the usual rack",
      input: { equipment: "dumbbell", bar, plates },
      source: "default",
    },
    {
      name: "a machine with only a cap, the cap",
      input: { equipment: "machine", ranges: [{ min: 0, max: 90, step: null }] },
      source: "cap",
    },
    {
      name: "a barbell with only a cap, its kit",
      input: { equipment: "barbell", ranges: [{ min: 0, max: 100, step: null }], bar, plates },
      source: "kit",
    },
  ] as const)("gives $name", ({ input, source }) => {
    expect(loadGridOf({ unit: "kg", ...input })?.source).toBe(source);
  });

  it.each([
    { name: "a barbell with no bar", input: { equipment: "barbell", bar: null, plates } },
    { name: "a machine with nothing set", input: { equipment: "machine", ranges: [] } },
    { name: "a cable with nothing set", input: { equipment: "cable", ranges: null } },
  ] as const)("gives $name no grid", ({ input }) => {
    expect(loadGridOf({ unit: "kg", ...input })).toBeNull();
  });

  it("snaps a dumbbell with no setting to the rack, not to a free sum", () => {
    const grid = loadGridOf({ equipment: "dumbbell", unit: "kg" });
    expect(addLoad(10, incrementFor(10, "dumbbell", settings, grid), "kg", grid)).toBe(12.5);
    expect(addLoad(27.5, 5, "kg", grid)).toBe(32.5);
    expect(grid?.capKg).toBeNull();
  });

  it("holds the kit and the manual increment under a cap alone", () => {
    const grid = loadGridOf({
      equipment: "barbell",
      unit: "kg",
      ranges: [{ min: 0, max: 100, step: null }],
      bar,
      plates,
    });
    const manual = { weightUnit: "kg", weightIncrementKg: 1.25 } as const;
    expect(grid?.capKg).toBe(100);
    expect(incrementFor(80, "barbell", settings, grid)).toBe(2.5);
    expect(incrementFor(80, "barbell", manual, grid)).toBe(1.25);
    expect(addLoad(97.5, 2.5, "kg", grid)).toBe(100);
    expect(addLoad(100, 2.5, "kg", grid)).toBeNull();
    expect(grid?.nearest(120)).toBe(100);
  });

  it.each([
    { name: "automatic", manual: null, at40: 2.5, expected: 42.5 },
    { name: "manual", manual: 5, at40: 5, expected: 45 },
  ])(
    "keeps the equipment's $name step under a machine's cap alone",
    ({ manual, at40, expected }) => {
      const grid = loadGridOf({
        equipment: "machine",
        unit: "kg",
        ranges: [{ min: 0, max: 90, step: null }],
      });
      const state = { weightUnit: "kg", weightIncrementKg: manual } as const;
      expect(incrementFor(40, "machine", state, grid)).toBe(at40);
      expect(addLoad(40, at40, "kg", grid)).toBe(expected);
      expect(addLoad(90, at40, "kg", grid)).toBeNull();
      expect(addLoad(88, 5, "kg", grid)).toBe(90);
    },
  );

  it("holds a dumbbell rack to its cap and keeps the rack's steps", () => {
    const grid = loadGridOf({
      equipment: "dumbbell",
      unit: "kg",
      ranges: [{ min: 0, max: 30, step: null }],
    });
    expect(addLoad(10, 1, "kg", grid)).toBe(12.5);
    expect(addLoad(27.5, 5, "kg", grid)).toBe(30);
    expect(addLoad(30, 2.5, "kg", grid)).toBeNull();
  });
});

describe("a dumbbell max over overlapping ranges", () => {
  it("clips every retained range to the cap", () => {
    const grid = loadGridOf({
      equipment: "dumbbell",
      unit: "kg",
      dumbbellMaxKg: 20,
      ranges: [
        { min: 5, max: 40, step: 5 },
        { min: 15, max: 50, step: 5 },
      ],
    });
    expect(grid?.capKg).toBe(20);
    expect(grid?.above(20)).toBeNull();
    expect(grid?.nearest(35)).toBeLessThanOrEqual(20);
  });

  it("keeps the highest range reachable when the max is above every range", () => {
    const ranges = [
      { min: 5, max: 40, step: 2.5 },
      { min: 15, max: 30, step: 5 },
    ];
    expect(gymRangesFor({ equipment: "dumbbell", ranges, dumbbellMaxKg: 50 })).toEqual(ranges);
  });
});

describe("default dumbbell step", () => {
  const inc = (kg: number, unit: "kg" | "lb" = "kg") =>
    incrementFor(kg, "dumbbell", { weightUnit: unit, weightIncrementKg: null });

  it.each([
    { kg: 2, step: 1 },
    { kg: 9, step: 1 },
    { kg: 9.9, step: 1 },
    { kg: 10, step: 2.5 },
    { kg: 30, step: 2.5 },
    { kg: 60, step: 2.5 },
  ])("is $step kg at $kg kg", ({ kg, step }) => expect(inc(kg)).toBe(step));

  it.each([
    { lb: 10, step: 2.5 },
    { lb: 20, step: 2.5 },
    { lb: 25, step: 5 },
    { lb: 70, step: 5 },
  ])("is $step lb at $lb lb", ({ lb, step }) =>
    expect(inc(lb * KG_PER_LB, "lb")).toBeCloseTo(step * KG_PER_LB, 6),
  );

  it("exposes the same steps as default ranges", () => {
    expect(defaultRangesFor("dumbbell", "kg")).toEqual([
      { min: 1, max: 10, step: 1 },
      { min: 12.5, max: null, step: 2.5 },
    ]);
    expect(defaultRangesFor("machine", "kg")).toEqual([{ min: 2.5, max: null, step: 2.5 }]);
    expect(defaultRangesFor("barbell", "kg", { weightKg: 20, stepKg: 2.5 })).toEqual([
      { min: 22.5, max: null, step: 2.5 },
    ]);
  });
});

describe("increment with a grid", () => {
  it("takes the step of the range the load is in", () => {
    const grid = rangeGrid(stack);
    expect(incrementFor(40, "machine", settings, grid)).toBe(5);
    // 2.5% of 90 kg is 2.25: still one step of 5.
    expect(incrementFor(90, "machine", settings, grid)).toBe(5);
  });

  it("lets the gym's step beat a manual increment, and a manual one beat the kit", () => {
    const gym = rangeGrid(stack);
    const kitGrid = barGrid({ weightKg: 20 }, plates);
    const manual = { weightUnit: "kg", weightIncrementKg: 1.25 } as const;
    expect(incrementFor(40, "machine", manual, gym)).toBe(5);
    expect(incrementFor(100, "barbell", manual, kitGrid)).toBe(1.25);
    expect(incrementFor(100, "barbell", settings, kitGrid)).toBe(2.5);
    expect(incrementFor(300, "barbell", settings, kitGrid)).toBe(7.5);
  });
});

describe("addLoad", () => {
  it.each([
    { name: "one step", ranges: stack, load: 40, added: 5, expected: 45 },
    {
      name: "snaps an add that lands between pins",
      ranges: stack,
      load: 40,
      added: 2,
      expected: 45,
    },
    { name: "easy doubled add", ranges: stack, load: 40, added: 10, expected: 50 },
    {
      name: "the add overshoots the cap by less than a step",
      ranges: stack,
      load: 85,
      added: 10,
      expected: 90,
    },
    { name: "the next pin is the cap", ranges: stack, load: 85, added: 5, expected: 90 },
    {
      name: "at the cap there is nothing to add",
      ranges: stack,
      load: 90,
      added: 5,
      expected: null,
    },
    {
      name: "past the cap there is nothing to add",
      ranges: stack,
      load: 95,
      added: 5,
      expected: null,
    },
    {
      name: "a cap that is no pin",
      ranges: [{ min: 10, max: 95, step: 10 }],
      load: 90,
      added: 10,
      expected: null,
    },
    { name: "across the jump", ranges: jumpStack, load: 25, added: 5, expected: 35 },
    { name: "rack, fine run", ranges: rack, load: 9, added: 1, expected: 10 },
    { name: "rack, across to coarse", ranges: rack, load: 10, added: 1, expected: 12.5 },
    { name: "rack, no cap", ranges: rack, load: 40, added: 2.5, expected: 42.5 },
  ])("$name", ({ ranges, load, added, expected }) => {
    expect(addLoad(load, added, "kg", rangeGrid(ranges))).toBe(expected);
  });

  it.each([
    { unit: "kg", cap: 100.15, expected: 100 },
    { unit: "lb", cap: 100, expected: 99.79 },
  ] as const)(
    "keeps rounded increments and deloads at or under the cap in $unit",
    ({ unit, cap, expected }) => {
      const grid = loadGridOf({
        equipment: "machine",
        unit,
        ranges: [{ min: 0, max: cap, step: null }],
      });
      expect(addLoad(95, 10, unit, grid)).toBe(expected);
      expect(lightenLoad(120, 0.9, "machine", unit, grid)).toBe(expected);
    },
  );

  it("is the plain sum, as typed, without a grid", () => {
    expect(addLoad(80, 2.5, "kg")).toBe(82.5);
    expect(addLoad(80, 2.26796, "lb")).toBe(parseWeight("181.5", "lb"));
  });

  it("goes up one pair of plates on a bar when the add is smaller than a pair", () => {
    expect(addLoad(80, 1, "kg", barGrid({ weightKg: 20 }, plates))).toBe(82.5);
  });
});

describe("lightenLoad with a grid", () => {
  it.each([
    { ranges: stack, load: 90, factor: 0.9, expected: 80 },
    { ranges: stack, load: 50, factor: 0.9, expected: 45 },
    { ranges: stack, load: 10, factor: 0.95, expected: 5 },
    { ranges: stack, load: 5, factor: 0.9, expected: 5 },
    { ranges: jumpStack, load: 35, factor: 0.9, expected: 35 - 10 },
    { ranges: stack, load: 120, factor: 0.9, expected: 90 },
  ])("$load kg at $factor on a grid is $expected kg", ({ ranges, load, factor, expected }) => {
    expect(lightenLoad(load, factor, "machine", "kg", rangeGrid(ranges))).toBe(expected);
  });

  it.each([
    { name: "below the bar, scaled as it is", load: 15, factor: 0.9, expected: 13.5 },
    { name: "the bare bar stays", load: 20, factor: 0.9, expected: 20 },
    { name: "just over the bar goes to the bar", load: 22.5, factor: 0.8, expected: 20 },
  ])("never raises a load on a bar: $name", ({ load, factor, expected }) => {
    expect(lightenLoad(load, factor, "barbell", "kg", barGrid({ weightKg: 20 }, plates))).toBe(
      expected,
    );
  });

  it.each([
    { load: 3, factor: 0.9, expected: 2.75 },
    { load: 5, factor: 0.8, expected: 5 },
    { load: 8, factor: 0.9, expected: 5 },
  ])("never raises a load on a grid that starts at 5: $load kg", ({ load, factor, expected }) => {
    expect(
      lightenLoad(load, factor, "machine", "kg", rangeGrid([{ min: 5, max: 90, step: 5 }])),
    ).toBe(expected);
  });

  it("rounds by the equipment's step under a cap alone, and stays under the cap", () => {
    const capped = loadGridOf({
      equipment: "machine",
      unit: "kg",
      ranges: [{ min: 0, max: 50, step: null }],
    });
    expect(lightenLoad(60, 0.9, "machine", "kg", capped)).toBe(50);
    expect(lightenLoad(40, 0.9, "machine", "kg", capped)).toBe(35);
  });

  it("goes down to a load the bar can make, always below the load", () => {
    const grid = barGrid({ weightKg: 20 }, plates);
    expect(lightenLoad(100, 0.9, "barbell", "kg", grid)).toBe(90);
    expect(lightenLoad(22.5, 0.99, "barbell", "kg", grid)).toBe(20);
    expect(lightenLoad(0, 0.9, "barbell", "kg", grid)).toBe(0);
  });

  it.each([
    { unit: "kg", weight: 45 * KG_PER_LB, expected: 20.25 },
    { unit: "lb", weight: 44.9 * KG_PER_LB, expected: 20.185 },
  ] as const)(
    "does not raise the bare bar after rounding in $unit",
    ({ unit, weight, expected }) => {
      const grid = barGrid({ weightKg: weight }, plates);
      expect(lightenLoad(weight, 0.9, "barbell", unit, grid)).toBe(expected);
    },
  );

  it("steps a light dumbbell by its default step", () => {
    expect(lightenLoad(20, 0.9, "dumbbell", "kg")).toBe(17.5);
    expect(lightenLoad(8, 0.9, "dumbbell", "kg")).toBe(7);
  });
});

describe("loadable", () => {
  it("snaps to the grid, else only round-trips the display", () => {
    expect(loadable(42, "kg", rangeGrid(stack))).toBe(40);
    expect(loadable(42, "kg")).toBe(42);
    expect(loadable(42.13, "kg")).toBe(42.25);
  });
});

describe("ranges and the two-field form", () => {
  it("round-trips a step and a cap", () => {
    const ranges = rangesFromLimits({ maxKg: 91, stepKg: 1 }, []);
    expect(ranges).toEqual([{ min: 1, max: 91, step: 1 }]);
    expect(limitsOfRanges(ranges)).toEqual({ maxKg: 91, stepKg: 1 });
  });

  it("a step alone has no cap", () => {
    expect(rangesFromLimits({ maxKg: null, stepKg: 5 }, [])).toEqual([
      { min: 5, max: null, step: 5 },
    ]);
  });

  it("a cap alone is stored without a step, so the equipment's own steps apply below it", () => {
    const ranges = rangesFromLimits({ maxKg: 24, stepKg: null }, rack);
    expect(ranges).toEqual([{ min: 0, max: 24, step: null }]);
    expect(limitsOfRanges(ranges)).toEqual({ maxKg: 24, stepKg: null });
    expect(rangeGrid(ranges)).toBeNull();
    expect(loadRangesSchema.safeParse(ranges).success).toBe(true);
  });

  const stackThenRack: LoadRange[] = [
    { min: 5, max: 20, step: 5 },
    { min: 25, max: 90, step: 2.5 },
  ];
  it.each([
    {
      name: "extends the last range",
      max: 120,
      expected: [stackThenRack[0], { min: 25, max: 120, step: 2.5 }],
    },
    {
      name: "clips the last range",
      max: 60,
      expected: [stackThenRack[0], { min: 25, max: 60, step: 2.5 }],
    },
    {
      name: "opens the last range",
      max: null,
      expected: [stackThenRack[0], { min: 25, max: null, step: 2.5 }],
    },
    { name: "drops the ranges above the cap", max: 15, expected: [{ min: 5, max: 15, step: 5 }] },
  ])("with the step untouched, a new max $name", ({ max, expected }) => {
    expect(rangesFromLimits({ maxKg: max, stepKg: 2.5 }, stackThenRack)).toEqual(expected);
  });

  it("a new step replaces the ranges with one", () => {
    expect(rangesFromLimits({ maxKg: 90, stepKg: 5 }, stackThenRack)).toEqual([
      { min: 5, max: 90, step: 5 },
    ]);
    expect(rangesFromLimits({ maxKg: 90, stepKg: 5 }, [{ min: 0, max: 90, step: null }])).toEqual([
      { min: 5, max: 90, step: 5 },
    ]);
  });

  it("clearing the step turns the ranges into a cap alone", () => {
    expect(rangesFromLimits({ maxKg: 90, stepKg: null }, stackThenRack)).toEqual([
      { min: 0, max: 90, step: null },
    ]);
  });

  it("neither gives no ranges, and none read as empty limits", () => {
    expect(rangesFromLimits({ maxKg: null, stepKg: null }, [])).toEqual([]);
    expect(limitsOfRanges([])).toEqual({ maxKg: null, stepKg: null });
  });

  it.each([
    { name: "valid", ranges: stack, ok: true },
    { name: "open-ended last", ranges: rack, ok: true },
    { name: "none", ranges: [], ok: true },
    { name: "open-ended first", ranges: [{ min: 1, max: null, step: 1 }, ...stack], ok: false },
    { name: "descending", ranges: [...stack].concat([{ min: 1, max: 4, step: 1 }]), ok: false },
    { name: "max under min", ranges: [{ min: 10, max: 5, step: 1 }], ok: false },
    { name: "zero step", ranges: [{ min: 1, max: 5, step: 0 }], ok: false },
    { name: "too heavy", ranges: [{ min: 1, max: 5000, step: 1 }], ok: false },
    { name: "a lone cap", ranges: [{ min: 0, max: 90, step: null }], ok: true },
    { name: "a cap with no max", ranges: [{ min: 0, max: null, step: null }], ok: false },
    { name: "a cap among ranges", ranges: [{ min: 0, max: 90, step: null }, ...rack], ok: false },
  ])("validates $name ranges", ({ ranges, ok }) => {
    expect(loadRangesSchema.safeParse(ranges).success).toBe(ok);
  });
});

describe("load basis", () => {
  it.each([
    { equipment: "dumbbell", basis: "per_hand" },
    { equipment: "kettlebell", basis: "per_hand" },
    { equipment: "barbell", basis: "total" },
    { equipment: "machine", basis: "total" },
    { equipment: "cable", basis: "total" },
    { equipment: "smith_machine", basis: "total" },
    { equipment: "none", basis: "total" },
  ] as const)("$equipment is $basis", ({ equipment, basis }) => {
    expect(loadBasisOf(equipment)).toBe(basis);
  });
});

describe("a gym's dumbbell max", () => {
  const lb = (pounds: number) => pounds * KG_PER_LB;
  const grid = (
    unit: "kg" | "lb",
    dumbbellMaxKg: number | null,
    ranges: LoadRange[] = [],
    equipment: "dumbbell" | "kettlebell" | "machine" = "dumbbell",
  ) => loadGridOf({ equipment, unit, ranges, dumbbellMaxKg });

  it.each([
    { name: "no max", unit: "kg", max: null, ranges: [], cap: null },
    { name: "kg, none own", unit: "kg", max: 30, ranges: [], cap: 30 },
    { name: "lb, none own", unit: "lb", max: lb(100), ranges: [], cap: lb(100) },
    {
      name: "own cap above the max",
      unit: "kg",
      max: 30,
      ranges: [{ min: 0, max: 40, step: null }],
      cap: 30,
    },
    {
      name: "own cap below the max wins",
      unit: "kg",
      max: 30,
      ranges: [{ min: 0, max: 20, step: null }],
      cap: 20,
    },
    {
      name: "own cap equal to the max",
      unit: "lb",
      max: lb(50),
      ranges: [{ min: 0, max: lb(50), step: null }],
      cap: lb(50),
    },
    { name: "own open rack", unit: "kg", max: 30, ranges: rack, cap: 30 },
    {
      name: "own rack that ends lower",
      unit: "kg",
      max: 30,
      ranges: [{ min: 1, max: 20, step: 1 }],
      cap: 20,
    },
  ] as const)("caps at $cap with $name", ({ unit, max, ranges, cap }) => {
    expect(grid(unit, max, [...ranges])?.capKg ?? null).toBeCloseTo(cap ?? 0, 6);
    if (cap === null) expect(grid(unit, max, [...ranges])?.capKg ?? null).toBeNull();
  });

  it.each([{ equipment: "machine" }, { equipment: "kettlebell" }] as const)(
    "does not cap $equipment",
    ({ equipment }) => {
      expect(grid("kg", 30, [], equipment)).toBeNull();
    },
  );

  it("keeps the default rack steps below the max, in kg", () => {
    const capped = grid("kg", 30);
    expect(capped?.source).toBe("default");
    expect(addLoad(9, 1, "kg", capped)).toBe(10);
    expect(addLoad(27.5, 2.5, "kg", capped)).toBe(30);
    expect(addLoad(30, 2.5, "kg", capped)).toBeNull();
    expect(addLoad(40, 2.5, "kg", capped)).toBeNull();
    expect(capped?.nearest(40)).toBe(30);
  });

  it("keeps the default rack steps below the max, in lb", () => {
    // The max is typed in pounds, so it is stored the way typing stores it.
    const max = parseWeight("50", "lb") ?? 0;
    const capped = grid("lb", max);
    expect(
      incrementFor(lb(30), "dumbbell", { weightUnit: "lb", weightIncrementKg: null }, capped),
    ).toBeCloseTo(lb(5), 6);
    expect(addLoad(lb(45), lb(5), "lb", capped)).toBe(max);
    expect(addLoad(max, lb(5), "lb", capped)).toBeNull();
    expect(lightenLoad(lb(80), 0.9, "dumbbell", "lb", capped)).toBe(max);
  });

  it("clips a stepped rack at the max and drops runs that start above it", () => {
    const capped = grid("kg", 11, rack);
    // 12.5 kg is above the max, so only the fine run stays and it ends at 10 kg.
    expect(capped?.capKg).toBe(10);
    expect(capped?.above(10)).toBeNull();
    expect(grid("kg", 5, rack)?.capKg).toBe(5);
    expect(grid("kg", 5, rack)?.above(4)).toBe(5);
    expect(grid("kg", 0.5, rack)?.capKg).toBe(0.5);
  });

  it("lets a lower own limit win in lightenLoad and addLoad", () => {
    const own = grid("kg", 30, [{ min: 0, max: 20, step: null }]);
    expect(addLoad(20, 2.5, "kg", own)).toBeNull();
    expect(lightenLoad(40, 0.9, "dumbbell", "kg", own)).toBe(20);
  });
});
