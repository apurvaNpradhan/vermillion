import { KG_PER_LB } from "./format";
import type { GymEquipmentInput } from "./session-inputs";
import type { WeightUnit } from "./vocabulary";

const KITS = {
  kg: { bars: [20, 15, 10, 0], plates: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5] },
  lb: { bars: [45, 35, 25, 0], plates: [45, 35, 25, 10, 5, 2.5] },
} as const satisfies Record<WeightUnit, { bars: readonly number[]; plates: readonly number[] }>;

/** The third bar of each kit is the EZ bar. */
const EZ_BAR_INDEX = 2;

/**
 * The kit seeded on first use (ADR 0038). kg: bars 20, 15, 10 (EZ) and 0, plates 25 down to
 * 0.5. lb: bars 45, 35, 25 and 0, plates 45 down to 2.5. Weights are stored in kg whatever the
 * unit, which only records the kit an item belongs to; plate counts are unlimited.
 */
export function defaultGymKit(unit: WeightUnit): GymEquipmentInput[] {
  const toKg = (weight: number) => (unit === "kg" ? weight : weight * KG_PER_LB);
  const { bars, plates } = KITS[unit];
  return [
    ...bars.map((weight, index) => ({
      kind: "bar" as const,
      weight_kg: toKg(weight),
      unit,
      label: index === EZ_BAR_INDEX ? "EZ" : null,
      count: null,
      enabled: true,
    })),
    ...plates.map((weight) => ({
      kind: "plate" as const,
      weight_kg: toKg(weight),
      unit,
      label: null,
      count: null,
      enabled: true,
    })),
  ];
}
