import { describe, expect, it } from "vitest";

import { EQUIPMENT } from "@workspace/shared";
import type { EquipmentRow, GymExerciseSettingRow, GymRow } from "@workspace/sync";

import { dismissCapPrompt, noteLoggedLoad } from "./cap-prompt";
import { buildGymLoads, resolveActiveGym, standardBar } from "./gym-loads";

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

  it.each(EQUIPMENT.filter((equipment) => equipment !== "barbell"))(
    "gives %s with no setting no grid, so its default step applies",
    (equipment) => {
      expect(loads.gridFor("unset", equipment)).toBeNull();
    },
  );

  it("an exercise whose ranges are empty falls back to the kit or the default", () => {
    expect(loads.gridFor("curl", "dumbbell")).toBeNull();
    expect(loads.gridFor("curl", "barbell")?.source).toBe("kit");
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

describe("the standard bar", () => {
  it("is the plain bar nearest 20 kg or 45 lb in the unit", () => {
    expect(standardBar(kit, "kg")).toEqual({ weightKg: 20, unit: "kg" });
    const mixed = [
      item({ id: "a", kind: "bar", weightKg: 15 }),
      item({ id: "b", kind: "bar", weightKg: 20.4117, unit: "lb" }),
    ];
    expect(standardBar(mixed, "lb")).toEqual({ weightKg: 20.4117, unit: "lb" });
    expect(standardBar(mixed, "kg")).toEqual({ weightKg: 15, unit: "kg" });
  });

  it("skips disabled and labelled bars, and none is null", () => {
    expect(standardBar([item({ kind: "bar", enabled: false })], "kg")).toBeNull();
    expect(standardBar([item({ kind: "bar", label: "EZ" })], "kg")).toBeNull();
    expect(standardBar([], "kg")).toBeNull();
  });
});

describe("the active gym", () => {
  const gyms: GymRow[] = [
    { id: "a", name: "My gym", createdAt: "1" },
    { id: "b", name: "Garage", createdAt: "2" },
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
  const key = "g:fly";
  const log = (
    prompts: ReturnType<typeof noteLoggedLoad>["prompts"],
    sessionId: string,
    suggestedKg: number,
    loggedKg: number,
  ) => noteLoggedLoad(prompts, { key, sessionId, suggestedKg, loggedKg });

  it("asks when two Sessions lower the suggestion to the same weight", () => {
    const first = log([], "s1", 95, 91);
    expect(first.ask).toBe(false);
    expect(first.prompts).toMatchObject([{ key, kg: 91, count: 1, sessionId: "s1" }]);
    expect(log(first.prompts, "s2", 93, 91).ask).toBe(true);
  });

  it("counts a Session once however many sets it lowers", () => {
    const first = log([], "s1", 95, 91);
    const again = log(first.prompts, "s1", 95, 91);
    expect(again.ask).toBe(false);
    expect(again.prompts).toEqual(first.prompts);
  });

  it("starts over on a different weight, and forgets the count when the suggestion is met", () => {
    const first = log([], "s1", 95, 91);
    const other = log(first.prompts, "s2", 95, 90);
    expect(other.ask).toBe(false);
    expect(other.prompts).toMatchObject([{ kg: 90, count: 1 }]);
    expect(log(first.prompts, "s2", 95, 95).prompts).toEqual([]);
    expect(log(first.prompts, "s2", 95, 100).prompts).toEqual([]);
  });

  it("never asks again once dismissed", () => {
    const dismissed = dismissCapPrompt([], key);
    expect(log(dismissed, "s1", 95, 91)).toEqual({ prompts: dismissed, ask: false });
    expect(log(dismissed, "s2", 95, 95).prompts).toEqual(dismissed);
  });

  it("ignores a logged load of zero and keeps other exercises' entries", () => {
    const other = { key: "g:row", kg: 50, count: 1, sessionId: "s0", dismissed: false };
    expect(log([other], "s1", 95, 0)).toEqual({ prompts: [other], ask: false });
    expect(log([other], "s1", 95, 91).prompts).toHaveLength(2);
  });
});
