import { describe, expect, it } from "vitest";

import { KG_PER_LB } from "./format";
import { defaultGymKit } from "./gym-kit";
import { gymEquipmentInput } from "./session-inputs";

describe("defaultGymKit", () => {
  it("is the kg kit: bars 20, 15, 10 (EZ) and 0, plates 25 down to 0.5", () => {
    const kit = defaultGymKit("kg");
    const bars = kit.filter((item) => item.kind === "bar");
    expect(bars.map((bar) => bar.weight_kg)).toEqual([20, 15, 10, 0]);
    expect(bars.map((bar) => bar.label)).toEqual([null, null, "EZ", null]);
    expect(kit.filter((item) => item.kind === "plate").map((plate) => plate.weight_kg)).toEqual([
      25, 20, 15, 10, 5, 2.5, 1.25, 0.5,
    ]);
  });

  it("is the lb kit: bars 45, 35, 25 and 0, plates 45 down to 2.5, stored in kg", () => {
    const kit = defaultGymKit("lb");
    const inPounds = (kind: "bar" | "plate") =>
      kit
        .filter((item) => item.kind === kind)
        .map((item) => Math.round((item.weight_kg / KG_PER_LB) * 1000) / 1000);
    expect(inPounds("bar")).toEqual([45, 35, 25, 0]);
    expect(inPounds("plate")).toEqual([45, 35, 25, 10, 5, 2.5]);
  });

  it("is enabled, unlimited, tagged with its unit and valid", () => {
    for (const unit of ["kg", "lb"] as const) {
      for (const item of defaultGymKit(unit)) {
        expect(item).toMatchObject({ unit, enabled: true, count: null });
        expect(gymEquipmentInput.safeParse(item).success).toBe(true);
      }
    }
  });
});
