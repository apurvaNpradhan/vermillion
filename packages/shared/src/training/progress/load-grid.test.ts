import { describe, expect, it } from "vitest";

import { defaultGymKit } from "../plates/gym-kit";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import {
  barGrid,
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

  it("cannot go under the bar, and a kit with no plates has no grid", () => {
    expect(barGrid({ weightKg: 20 }, plates)?.below(20)).toBeNull();
    expect(barGrid({ weightKg: 20 }, [])).toBeNull();
  });

  it("limits the loads to the plates that exist", () => {
    const grid = barGrid({ weightKg: 20 }, [{ id: "a", weightKg: 10, count: 1 }]);
    expect(grid?.above(40)).toBeNull();
    expect(grid?.nearest(100)).toBe(40);
  });
});

describe("loadGridOf", () => {
  it("prefers the gym's ranges, then the barbell's plates, else none", () => {
    expect(loadGridOf({ equipment: "machine", ranges: stack })?.source).toBe("gym");
    expect(
      loadGridOf({ equipment: "barbell", ranges: stack, bar: { weightKg: 20 }, plates })?.source,
    ).toBe("gym");
    expect(
      loadGridOf({ equipment: "barbell", ranges: [], bar: { weightKg: 20 }, plates })?.source,
    ).toBe("kit");
    expect(loadGridOf({ equipment: "barbell", ranges: null, bar: null, plates })).toBeNull();
    expect(loadGridOf({ equipment: "dumbbell", bar: { weightKg: 20 }, plates })).toBeNull();
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
    expect(defaultRangesFor("machine", "kg")).toEqual([{ min: 1, max: null, step: 1 }]);
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
      expected: 95,
    },
    { name: "across the jump", ranges: jumpStack, load: 25, added: 5, expected: 35 },
    { name: "rack, fine run", ranges: rack, load: 9, added: 1, expected: 10 },
    { name: "rack, across to coarse", ranges: rack, load: 10, added: 1, expected: 12.5 },
    { name: "rack, no cap", ranges: rack, load: 40, added: 2.5, expected: 42.5 },
  ])("$name", ({ ranges, load, added, expected }) => {
    expect(addLoad(load, added, "kg", rangeGrid(ranges))).toBe(expected);
  });

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

  it("goes down to a load the bar can make, always below the load", () => {
    const grid = barGrid({ weightKg: 20 }, plates);
    expect(lightenLoad(100, 0.9, "barbell", "kg", grid)).toBe(90);
    expect(lightenLoad(22.5, 0.99, "barbell", "kg", grid)).toBe(20);
    expect(lightenLoad(0, 0.9, "barbell", "kg", grid)).toBe(0);
  });

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

  it("a cap alone keeps the equipment's own steps below it", () => {
    expect(
      rangesFromLimits({ maxKg: 24, stepKg: null }, defaultRangesFor("dumbbell", "kg")),
    ).toEqual([
      { min: 1, max: 10, step: 1 },
      { min: 12.5, max: 24, step: 2.5 },
    ]);
    expect(
      rangesFromLimits({ maxKg: 8, stepKg: null }, defaultRangesFor("dumbbell", "kg")),
    ).toEqual([{ min: 1, max: 8, step: 1 }]);
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
