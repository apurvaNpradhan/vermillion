import { defaultGymKit, KG_PER_LB, loadBar } from "@workspace/shared";
import type { EquipmentRow } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import {
  addToStack,
  canSeedEquipment,
  clearStack,
  defaultBar,
  enabledBars,
  formatDifference,
  hasTarget,
  kitGroups,
  loadChoices,
  loadInputKey,
  missingKitItems,
  nearestChoice,
  overInventory,
  plateGroups,
  plateLayout,
  platesForBar,
  plateRole,
  removeFromStack,
  removeKindFromStack,
  selectedChoice,
  stackCount,
  stackSideKg,
  stackTotalKg,
} from "./plate-view";

let nextId = 0;
const row = (
  over: Partial<EquipmentRow> & Pick<EquipmentRow, "kind" | "weightKg">,
): EquipmentRow => ({
  id: `row-${nextId++}`,
  unit: "kg",
  label: null,
  count: null,
  enabled: true,
  ...over,
});
const kit = (unit: "kg" | "lb") =>
  defaultGymKit(unit).map((item) =>
    row({
      kind: item.kind,
      weightKg: item.weight_kg,
      unit: item.unit,
      label: item.label,
    }),
  );
const plate = (weightKg: number) => ({ id: String(weightKg), weightKg, count: null });

describe("platesForBar", () => {
  it("keeps enabled plates of the bar's unit only", () => {
    const rows = [...kit("kg"), ...kit("lb"), row({ kind: "plate", weightKg: 99, enabled: false })];
    const bar = rows.find((r) => r.kind === "bar" && r.unit === "lb");
    if (!bar) throw new Error("no lb bar");
    const plates = platesForBar(rows, bar);
    expect(plates).toHaveLength(defaultGymKit("lb").filter((i) => i.kind === "plate").length);
    expect(plates.map((p) => p.weightKg)).not.toContain(99);
    expect(plates.every((p) => p.weightKg !== 25)).toBe(true);
  });
});

describe("defaultBar", () => {
  const rows = [...kit("kg"), ...kit("lb")];
  const bars = enabledBars(rows);
  it("prefers the remembered bar, even in the other unit", () => {
    const lbBar = bars.find((b) => b.unit === "lb");
    expect(defaultBar(bars, lbBar?.id, "kg")).toBe(lbBar);
  });
  it("falls back to the standard bar of the preferred unit", () => {
    expect(defaultBar(bars, "gone", "lb")?.weightKg).toBeCloseTo(45 * KG_PER_LB);
    expect(defaultBar(bars, null, "kg")?.weightKg).toBe(20);
    expect(defaultBar(bars, null, "kg")?.unit).toBe("kg");
  });
  it("takes any bar of the preferred unit, then any bar", () => {
    const heavy = row({ kind: "bar", weightKg: 25 });
    expect(defaultBar([heavy], null, "kg")).toBe(heavy);
    expect(defaultBar([heavy], null, "lb")).toBe(heavy);
    expect(defaultBar([], null, "kg")).toBeUndefined();
  });
});

describe("loadChoices and nearest", () => {
  it("offers both neighbours with signed differences for 61 kg", () => {
    const result = loadBar(61, { weightKg: 20 }, [plate(20), plate(1.25)]);
    const choices = loadChoices(61, result);
    expect(choices.map((c) => [c.side, c.load.totalKg, c.differenceKg])).toEqual([
      ["below", 60, -1],
      ["above", 62.5, 1.5],
    ]);
    expect(nearestChoice(choices)?.side).toBe("below");
  });
  it("breaks a tie towards the lower load", () => {
    const result = loadBar(61.25, { weightKg: 20 }, [plate(20), plate(1.25)]);
    const choices = loadChoices(61.25, result);
    expect(nearestChoice(choices)?.load.totalKg).toBe(60);
    expect(nearestChoice([...choices].reverse())?.load.totalKg).toBe(60);
  });
  it("chooses the nearer upper load", () => {
    const result = loadBar(62, { weightKg: 20 }, [plate(20), plate(1.25)]);
    expect(nearestChoice(loadChoices(62, result))?.load.totalKg).toBe(62.5);
  });
  it("is a single zero-difference choice when exact", () => {
    const result = loadBar(60, { weightKg: 20 }, [plate(20)]);
    expect(loadChoices(60, result)).toHaveLength(1);
    expect(loadChoices(60, result)[0]?.differenceKg).toBe(0);
  });
  it("shows the bare bar when the target is below it", () => {
    const result = loadBar(10, { weightKg: 20 }, [plate(20)]);
    const choices = loadChoices(10, result);
    expect(choices).toHaveLength(1);
    expect(choices[0]?.side).toBe("above");
    expect(choices[0]?.load.platesPerSide).toEqual([]);
    expect(choices[0]?.load.totalKg).toBe(20);
  });
  it("follows the pick while it exists and the nearest otherwise", () => {
    const result = loadBar(61, { weightKg: 20 }, [plate(20), plate(1.25)]);
    const choices = loadChoices(61, result);
    expect(selectedChoice(choices, "above")?.load.totalKg).toBe(62.5);
    expect(selectedChoice(choices.slice(0, 1), "above")?.load.totalKg).toBe(60);
    expect(selectedChoice([], null)).toBeNull();
  });
});

describe("formatDifference", () => {
  it("drops the sign and trailing zeros in the unit", () => {
    expect(formatDifference(-1.5, "kg")).toBe("1.5");
    expect(formatDifference(0.25, "kg")).toBe("0.25");
    expect(formatDifference(5 * KG_PER_LB, "lb")).toBe("5");
  });
});

describe("hasTarget", () => {
  it("asks for a weight when empty, zero or invalid", () => {
    expect(hasTarget(0)).toBe(false);
    expect(hasTarget(Number.NaN)).toBe(false);
    expect(hasTarget(-1)).toBe(false);
    expect(hasTarget(60)).toBe(true);
  });
});

describe("plateGroups", () => {
  it("folds equal neighbours", () => {
    expect(plateGroups([plate(20), plate(20), plate(5)])).toEqual([
      { weightKg: 20, count: 2 },
      { weightKg: 5, count: 1 },
    ]);
    expect(plateGroups([])).toEqual([]);
  });
});

describe("plateLayout", () => {
  const label = (kg: number) => String(kg);
  it("stacks plates from the collar, each against the last", () => {
    const { slots, collarX, collarWidth } = plateLayout([plate(20), plate(10)], label, 400);
    expect(slots[0]?.x).toBeGreaterThan(collarX + collarWidth - 1);
    expect(slots[1]?.x).toBeGreaterThan((slots[0]?.x ?? 0) + (slots[0]?.width ?? 0) - 0.001);
  });
  it("draws heavier plates taller and wider", () => {
    const { slots } = plateLayout([plate(25), plate(5), plate(1.25)], label, 400);
    expect(slots[0]?.height).toBeGreaterThan(slots[1]?.height ?? 0);
    expect(slots[1]?.height).toBeGreaterThan(slots[2]?.height ?? 0);
    expect(slots[0]?.width).toBeGreaterThan(slots[2]?.width ?? 0);
  });
  it("keeps the stack inside the available width by thinning plates", () => {
    const many = Array.from({ length: 10 }, () => plate(20));
    const { width } = plateLayout(many, label, 300);
    expect(width).toBeLessThanOrEqual(300 + 1);
  });
  it("fits even a very long stack of small plates", () => {
    const many = Array.from({ length: 80 }, () => plate(0.5));
    const { width } = plateLayout(many, label, 300);
    expect(width).toBeLessThanOrEqual(300 + 2);
  });
  it("draws a bare bar with a shaft and collar and no plates", () => {
    const layout = plateLayout([], label, 300);
    expect(layout.slots).toEqual([]);
    expect(layout.width).toBeGreaterThan(layout.collarX + layout.collarWidth);
    expect(layout.height).toBe(layout.collarHeight);
  });
  it("labels every plate tall enough to hold its weight", () => {
    const { slots } = plateLayout([plate(25), plate(1.25), plate(0.5)], label, 400);
    expect(slots.every((slot) => slot.showLabel)).toBe(true);
  });
});

describe("plateRole", () => {
  it("colours kg plates the competition way", () => {
    expect(plateRole(25, "kg")).toBe("red");
    expect(plateRole(20, "kg")).toBe("blue");
    expect(plateRole(15, "kg")).toBe("yellow");
    expect(plateRole(10, "kg")).toBe("green");
    expect(plateRole(5, "kg")).toBe("white");
    expect(plateRole(1.25, "kg")).toBe("black");
  });
  it("colours lb plates by their pound weight, not a converted-kg float", () => {
    expect(plateRole(45 * KG_PER_LB, "lb")).toBe("blue");
    expect(plateRole(35 * KG_PER_LB, "lb")).toBe("yellow");
    expect(plateRole(25 * KG_PER_LB, "lb")).toBe("green");
    expect(plateRole(10 * KG_PER_LB, "lb")).toBe("white");
    expect(plateRole(2.5 * KG_PER_LB, "lb")).toBe("black");
  });
});

describe("loadInputKey", () => {
  const bar = { id: "b", weightKg: 20 };
  it("is stable for equal inputs and changes with meaningful ones", () => {
    const key = loadInputKey(bar, [plate(20)]);
    expect(loadInputKey({ ...bar }, [plate(20)])).toBe(key);
    expect(loadInputKey({ ...bar, weightKg: 15 }, [plate(20)])).not.toBe(key);
    expect(loadInputKey(bar, [plate(20), plate(5)])).not.toBe(key);
    expect(loadInputKey(bar, [{ ...plate(20), count: 2 }])).not.toBe(key);
    expect(loadInputKey(undefined, [])).toBe("-");
  });
});

describe("canSeedEquipment", () => {
  const ready = {
    hasSynced: true,
    scope: "install",
    loaded: true,
    rowCount: 0,
    alreadySeeded: false,
  };
  it("seeds an empty synced inventory once", () => {
    expect(canSeedEquipment(ready)).toBe(true);
    expect(canSeedEquipment({ ...ready, alreadySeeded: true })).toBe(false);
  });
  it.each([
    ["before the first sync", { hasSynced: false }],
    ["without a write scope", { scope: null }],
    ["with an empty write scope", { scope: "" }],
    ["before the inventory loads", { loaded: false }],
    ["with equipment present", { rowCount: 3 }],
  ])("does not seed %s", (_name, change) => {
    expect(canSeedEquipment({ ...ready, ...change })).toBe(false);
  });
});

describe("missingKitItems", () => {
  it("is the whole kit for an empty inventory", () => {
    expect(missingKitItems([], "lb")).toHaveLength(defaultGymKit("lb").length);
  });
  it("is nothing when the kit is complete, enabled or not", () => {
    const rows = kit("kg").map((r, i) => ({ ...r, enabled: i % 2 === 0 }));
    expect(missingKitItems(rows, "kg")).toEqual([]);
  });
  it("adds only what is absent and ignores the other unit", () => {
    const rows = [...kit("kg"), row({ kind: "plate", weightKg: 20 * KG_PER_LB, unit: "lb" })];
    const missing = missingKitItems(rows, "lb");
    expect(missing).toHaveLength(defaultGymKit("lb").length);
    const partial = kit("lb").filter((r) => !(r.kind === "plate" && r.weightKg > 20));
    const items = missingKitItems(partial, "lb");
    expect(items.every((i) => i.kind === "plate" && i.weight_kg > 20)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });
  it("keeps a custom bar from hiding a differently named default bar", () => {
    const rows = [row({ kind: "bar", weightKg: 10, label: "Trap bar" })];
    expect(missingKitItems(rows, "kg").some((i) => i.kind === "bar" && i.weight_kg === 10)).toBe(
      true,
    );
  });
});

describe("kitGroups", () => {
  it("lists the preferred unit first, and the other only when it holds equipment", () => {
    expect(kitGroups([], "lb").map((g) => g.unit)).toEqual(["lb"]);
    expect(kitGroups(kit("kg"), "lb").map((g) => g.unit)).toEqual(["lb", "kg"]);
    const groups = kitGroups([...kit("kg"), ...kit("lb")], "kg");
    expect(groups.map((g) => g.unit)).toEqual(["kg", "lb"]);
    expect(groups[0]?.bars.every((b) => b.unit === "kg")).toBe(true);
  });
});

describe("plate stack", () => {
  const p = (weightKg: number, count: number | null = null) => ({
    id: String(weightKg),
    weightKg,
    count,
  });
  it("keeps the heaviest nearest the collar and repeats stack up", () => {
    let stack = addToStack([], p(10));
    stack = addToStack(stack, p(20));
    stack = addToStack(stack, p(2.5));
    stack = addToStack(stack, p(20));
    expect(stack.map((x) => x.weightKg)).toEqual([20, 20, 10, 2.5]);
  });
  it("totals the bar plus both sides", () => {
    const stack = [p(20), p(20), p(10), p(2.5)];
    expect(stackSideKg(stack)).toBe(52.5);
    expect(stackTotalKg(20, stack)).toBe(125);
    expect(stackTotalKg(20, clearStack())).toBe(20);
  });
  it("removes by drawn position or one of a kind", () => {
    const stack = [p(20), p(20), p(10)];
    expect(removeFromStack(stack, 1).map((x) => x.weightKg)).toEqual([20, 10]);
    expect(removeFromStack(stack, 9)).toHaveLength(3);
    expect(removeKindFromStack(stack, "20").map((x) => x.weightKg)).toEqual([20, 10]);
    expect(removeKindFromStack(stack, "5")).toHaveLength(3);
    expect(stackCount(stack, "20")).toBe(2);
  });
  it("reports kinds used on more pairs than owned", () => {
    const stack = [p(20), p(20), p(20), p(10), p(5)];
    const inventory = [p(20, 2), p(10, null)];
    expect(overInventory(stack, inventory)).toEqual(["20", "5"]);
    expect(overInventory([p(20)], inventory)).toEqual([]);
  });
});
