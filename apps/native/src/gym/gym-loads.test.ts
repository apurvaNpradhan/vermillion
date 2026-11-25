import { describe, expect, it } from "vitest";

import { EQUIPMENT, type Equipment } from "@workspace/shared";
import type { EquipmentRow, GymExerciseSettingRow, GymRow } from "@workspace/sync";

import { capPromptKey, dismissCapPrompt, noteLoggedLoad, pendingCapPrompt } from "./cap-prompt";
import { buildGymLoads, resolveActiveGym } from "./gym-loads";

const item = (over: Partial<EquipmentRow>): EquipmentRow => ({
  id: "x",
  kind: "plate",
  weightKg: 5,
  unit: "kg",
  label: null,
  count: null,
  enabled: true,
  ...over,
});
const kit: EquipmentRow[] = [
  item({ id: "bar", kind: "bar", weightKg: 20 }),
  item({ id: "ez", kind: "bar", weightKg: 10, label: "EZ" }),
  item({ id: "p25", weightKg: 25 }),
  item({ id: "p5", weightKg: 5 }),
  item({ id: "p125", weightKg: 1.25 }),
  item({ id: "off", weightKg: 0.5, enabled: false }),
];
const setting = (exerciseId: string, ranges: GymExerciseSettingRow["loadRanges"]) => ({
  exerciseId,
  loadRanges: ranges,
  setupNote: null,
});

describe("loads of the active gym", () => {
  const loads = buildGymLoads({
    gymId: "g",
    settings: [setting("fly", [{ min: 5, max: 91, step: 1 }]), setting("curl", [])],
    kit,
    unit: "kg",
  });

  it("gives an exercise with ranges the gym's grid and its cap", () => {
    expect(loads.gymId).toBe("g");
    const grid = loads.gridFor("fly", "machine");
    expect(grid?.source).toBe("gym");
    expect(grid?.capKg).toBe(91);
  });

  it("gives a barbell the loads of the gym's bar and enabled plates", () => {
    const grid = loads.gridFor("squat", "barbell");
    expect(grid?.source).toBe("kit");
    // Pairs of 1.25 kg plates: the smallest step is 2.5 kg, the disabled 0.5 kg plate is ignored.
    expect(grid?.above(100)).toBe(102.5);
  });

  it.each(EQUIPMENT.filter((equipment) => equipment !== "barbell" && equipment !== "dumbbell"))(
    "gives %s with no setting no grid, so its default step applies",
    (equipment) => {
      expect(loads.gridFor("unset", equipment)).toBeNull();
    },
  );

  it("gives a dumbbell with no setting the usual rack, so its loads snap to it", () => {
    const grid = loads.gridFor("unset", "dumbbell");
    expect(grid?.source).toBe("default");
    expect(grid?.above(10)).toBe(12.5);
  });

  it("an exercise whose ranges are empty falls back to the kit or the default", () => {
    expect(loads.gridFor("curl", "dumbbell")?.source).toBe("default");
    expect(loads.gridFor("curl", "barbell")?.source).toBe("kit");
  });

  it("holds the kit's loads to a cap set without a step", () => {
    const capped = buildGymLoads({
      gymId: "g",
      settings: [setting("squat", [{ min: 0, max: 100, step: null }])],
      kit,
      unit: "kg",
    });
    const grid = capped.gridFor("squat", "barbell");
    expect(grid?.source).toBe("kit");
    expect(grid?.capKg).toBe(100);
    expect(grid?.above(97.5)).toBe(100);
  });

  it("gives no barbell grid for a bar-less kit", () => {
    const bare = buildGymLoads({ gymId: "g", settings: [], kit: [item({})], unit: "kg" });
    expect(bare.gridFor("squat", "barbell")).toBeNull();
  });

  it("reads back a setting", () => {
    expect(loads.settingFor("fly")?.loadRanges).toHaveLength(1);
    expect(loads.settingFor("none")).toBeUndefined();
  });
});

describe("a gym's equipment and dumbbell max", () => {
  const build = (
    unit: "kg" | "lb",
    dumbbellMaxKg: number | null,
    settings: GymExerciseSettingRow[] = [],
    unavailableEquipment: Equipment[] = [],
  ) => buildGymLoads({ gymId: "g", settings, kit, unit, dumbbellMaxKg, unavailableEquipment });

  it.each([
    { name: "kg, no own limit", unit: "kg", max: 32.5, own: [], cap: 32.5 },
    { name: "lb, no own limit", unit: "lb", max: 22.68, own: [], cap: 22.68 },
    {
      name: "own cap lower wins",
      unit: "kg",
      max: 32.5,
      own: [{ min: 0, max: 20, step: null }],
      cap: 20,
    },
    {
      name: "own cap higher is held to the max",
      unit: "kg",
      max: 32.5,
      own: [{ min: 0, max: 40, step: null }],
      cap: 32.5,
    },
    {
      name: "own rack held to the max",
      unit: "kg",
      max: 30,
      own: [{ min: 1, max: null, step: 1 }],
      cap: 30,
    },
    { name: "no max", unit: "kg", max: null, own: [], cap: null },
  ] as const)("caps a dumbbell exercise: $name", ({ unit, max, own, cap }) => {
    const loads = build(unit, max, [setting("press", [...own])]);
    expect(loads.gridFor("press", "dumbbell")?.capKg ?? null).toBe(cap);
  });

  it("caps every dumbbell exercise, one without a setting too, and nothing else", () => {
    const loads = build("kg", 30, [setting("press", [{ min: 5, max: 91, step: 1 }])]);
    expect(loads.gridFor("curl", "dumbbell")?.capKg).toBe(30);
    expect(loads.gridFor("press", "dumbbell")?.capKg).toBe(30);
    expect(loads.gridFor("press", "machine")?.capKg).toBe(91);
    expect(loads.gridFor("rdl", "barbell")?.capKg ?? null).toBeNull();
    expect(loads.gridFor("goblet", "kettlebell")).toBeNull();
  });

  it("gives warm-ups the same ranges as the grid", () => {
    const loads = build("kg", 30, [setting("press", [{ min: 0, max: 40, step: null }])]);
    expect(loads.rangesFor("press", "dumbbell")).toEqual([{ min: 0, max: 30, step: null }]);
    expect(loads.rangesFor("curl", "dumbbell")).toEqual([{ min: 0, max: 30, step: null }]);
    expect(loads.rangesFor("fly", "machine")).toEqual([]);
    expect(build("kg", null).rangesFor("curl", "dumbbell")).toEqual([]);
  });

  it.each([
    { equipment: "barbell", lacking: ["barbell"], here: false },
    { equipment: "dumbbell", lacking: ["barbell"], here: true },
    { equipment: "none", lacking: ["none", "machine"], here: true },
    { equipment: "machine", lacking: ["machine", "cable"], here: false },
  ] as const)(
    "says whether $equipment is here when $lacking are not",
    ({ equipment, lacking, here }) => {
      expect(build("kg", null, [], [...lacking]).hasEquipment(equipment)).toBe(here);
    },
  );
});

describe("the bar an exercise loads with", () => {
  const rows = [
    item({ id: "bar", kind: "bar", weightKg: 20 }),
    item({ id: "light", kind: "bar", weightKg: 15 }),
    item({ id: "ez", kind: "bar", weightKg: 10, label: "EZ" }),
    item({ id: "p25", weightKg: 25 }),
    item({ id: "p5", weightKg: 5 }),
    item({ id: "p1", weightKg: 1 }),
  ];
  const at = (bars: ReadonlyMap<string, string> | undefined, kitRows = rows) =>
    buildGymLoads({ gymId: "g", settings: [], kit: kitRows, bars, unit: "kg" }).gridFor(
      "squat",
      "barbell",
    );

  it.each([
    { name: "the gym's default bar when none is remembered", bars: undefined, atBar: 20 },
    { name: "the bar the exercise remembers", bars: new Map([["squat", "light"]]), atBar: 15 },
    {
      name: "the gym's default bar when the remembered bar belongs to another gym",
      bars: new Map([["squat", "bar-of-another-gym"]]),
      atBar: 20,
    },
  ])("is $name", ({ bars, atBar }) => {
    // The bare bar is the lightest load; one pair of the 1 kg plates is the next.
    expect(at(bars)?.above(atBar)).toBe(atBar + 2);
    expect(at(bars)?.below(atBar + 2)).toBe(atBar);
  });

  it("ignores a remembered bar that is disabled here", () => {
    const off = rows.map((row) => (row.id === "light" ? { ...row, enabled: false } : row));
    expect(at(new Map([["squat", "light"]]), off)?.below(22)).toBe(20);
  });

  it("is none for a kit with no bar", () => {
    expect(at(undefined, [item({ id: "p5" })])).toBeNull();
  });
});

describe("the active gym", () => {
  const gyms: GymRow[] = [
    { id: "a", name: "My gym", createdAt: "1", unavailableEquipment: [], dumbbellMaxKg: null },
    { id: "b", name: "Garage", createdAt: "2", unavailableEquipment: [], dumbbellMaxKg: null },
  ];
  it.each([
    { chosen: "b", expected: "b" },
    { chosen: "gone", expected: "a" },
    { chosen: null, expected: "a" },
  ])("chosen $chosen is $expected", ({ chosen, expected }) => {
    expect(resolveActiveGym(gyms, chosen)).toBe(expected);
  });
  it("is none with no gyms", () => expect(resolveActiveGym([], "a")).toBeNull());
});

describe("asking whether it is the max", () => {
  const key = capPromptKey("g", "fly");
  const log = (
    prompts: NonNullable<ReturnType<typeof noteLoggedLoad>>,
    sessionId: string,
    suggestedKg: number,
    loggedKg: number,
  ) => noteLoggedLoad(prompts, { key, sessionId, suggestedKg, loggedKg });
  const first = log([], "s1", 95, 91) ?? [];

  it("asks after two Sessions lower the suggestion to the same weight", () => {
    expect(pendingCapPrompt(first, key, "s1")).toBeUndefined();
    const second = log(first, "s2", 93, 91) ?? [];
    expect(pendingCapPrompt(second, key, "s2")).toMatchObject({ kg: 91 });
    expect(pendingCapPrompt(second, key, "s1")).toBeUndefined();
    expect(pendingCapPrompt(second, capPromptKey("another-gym", "fly"), "s2")).toBeUndefined();
  });

  it("counts a Session once even when later sets are logged at different loads", () => {
    expect(log(first, "s1", 95, 91)).toBeNull();
    expect(log(first, "s1", 95, 90)).toBeNull();
    expect(log(first, "s1", 95, 95)).toBeNull();
  });

  it("starts over on a different weight and forgets the count when the suggestion is met", () => {
    expect(log(first, "s2", 95, 90)).toMatchObject([{ kg: 90, count: 1 }]);
    expect(log(first, "s2", 95, 95)).toEqual([]);
    expect(log(first, "s2", 95, 100)).toEqual([]);
    expect(log(first, "s2", 95, 0)).toBeNull();
  });

  it("never asks again once dismissed", () => {
    const dismissed = dismissCapPrompt(log(first, "s2", 95, 91) ?? [], key);
    expect(pendingCapPrompt(dismissed, key, "s2")).toBeUndefined();
    expect(log(dismissed, "s3", 95, 91)).toBeNull();
  });
});
