import { defaultGymKit, KG_PER_LB, loadBar } from "@workspace/shared";
import type { EquipmentRow } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import {
  canSeedEquipment,
  defaultBar,
  enabledBars,
  formatDifference,
  hasTarget,
  kitGroups,
  labelFits,
  loadChoices,
  loadInputKey,
  missingKitItems,
  nearestChoice,
  plateGroups,
  plateLayout,
  platesForBar,
  selectedChoice,
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
  it("sizes the drawing from the real stack", () => {
    const few = plateLayout([plate(20)], label);
    const many = plateLayout([plate(20), plate(20), plate(20), plate(20)], label);
    expect(many.width).toBeGreaterThan(few.width);
    const last = many.slots[3];
    expect(last && many.width).toBeGreaterThan((last?.x ?? 0) + (last?.width ?? 0));
    expect(many.slots[1]?.x).toBe((many.slots[0]?.x ?? 0) + (many.slots[0]?.width ?? 0) + 2);
  });
  it("has a minimum width for a bare bar", () => {
    expect(plateLayout([], label).width).toBeGreaterThan(0);
  });
  it("hides labels that do not fit", () => {
    const { slots } = plateLayout([plate(20), plate(1.25)], label);
    expect(slots[0]?.showLabel).toBe(true);
    expect(slots[1]?.showLabel).toBe(false);
    expect(labelFits(36, "25")).toBe(true);
    expect(labelFits(14, "1.25")).toBe(false);
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
