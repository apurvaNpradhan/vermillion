import { KG_PER_LB } from "../vocabulary/format";
import type { GymEquipmentInput } from "../logging/session-inputs";
import type { WeightUnit } from "../vocabulary/vocabulary";
import type { TrainingPlace } from "../vocabulary/profile";

const KITS = {
  kg: { bars: [20, 15, 10, 0], trap: 25, plates: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5] },
  lb: { bars: [45, 35, 25, 0], trap: 55, plates: [45, 35, 25, 10, 5, 2.5] },
} as const satisfies Record<
  WeightUnit,
  { bars: readonly number[]; trap: number; plates: readonly number[] }
>;

/**
 * The smaller kit for a home: one bar, a bar-less 0 and the plates a home set usually has, with
 * no EZ or trap bar. Anything else can be added in the equipment screen.
 */
const HOME_KITS = {
  kg: { bars: [20, 0], plates: [20, 15, 10, 5, 2.5, 1.25] },
  lb: { bars: [45, 0], plates: [45, 35, 25, 10, 5, 2.5] },
} as const satisfies Record<WeightUnit, { bars: readonly number[]; plates: readonly number[] }>;

/** The third bar of each kit is the EZ bar. */
const EZ_BAR_INDEX = 2;

/** The labels the plate calculator looks for to open an EZ bar or trap bar exercise (ADR 0050). */
export const EZ_BAR_LABEL = "EZ";
export const TRAP_BAR_LABEL = "Trap";

/**
 * The kit seeded on first use (ADR 0038). kg: bars 20, 15, 10 (EZ) and 0, plates 25 down to
 * 0.5. lb: bars 45, 35, 25 and 0, plates 45 down to 2.5. Both kits end their bars with a trap
 * bar (25 kg, 55 lb). Any place but the gym seeds the smaller home kit. Weights are stored in kg whatever the unit, which only records the kit an
 * item belongs to; plate counts are unlimited.
 */
export function defaultGymKit(
  unit: WeightUnit,
  place: TrainingPlace | null = null,
): GymEquipmentInput[] {
  const toKg = (weight: number) => (unit === "kg" ? weight : weight * KG_PER_LB);
  if (place !== null && place !== "gym") {
    const home = HOME_KITS[unit];
    return [
      ...home.bars.map((weight) => ({
        kind: "bar" as const,
        weight_kg: toKg(weight),
        unit,
        label: null,
        count: null,
        enabled: true,
      })),
      ...home.plates.map((weight) => ({
        kind: "plate" as const,
        weight_kg: toKg(weight),
        unit,
        label: null,
        count: null,
        enabled: true,
      })),
    ];
  }
  const { bars, trap, plates } = KITS[unit];
  return [
    ...bars.map((weight, index) => ({
      kind: "bar" as const,
      weight_kg: toKg(weight),
      unit,
      label: index === EZ_BAR_INDEX ? EZ_BAR_LABEL : null,
      count: null,
      enabled: true,
    })),
    {
      kind: "bar" as const,
      weight_kg: toKg(trap),
      unit,
      label: TRAP_BAR_LABEL,
      count: null,
      enabled: true,
    },
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
