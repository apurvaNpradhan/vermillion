import {
  KG_PER_LB,
  loadGridOf,
  type Equipment,
  type LoadGrid,
  type LoadPlate,
  type WeightUnit,
} from "@workspace/shared";
import type { EquipmentRow, GymExerciseSettingRow, GymRow } from "@workspace/sync";

/** What the active gym says about loads, read by progression, the plate calculator and the editors. */
export type GymLoads = {
  /** The gym the user trains at; null before the first sync has delivered one. */
  gymId: string | null;
  /** The loads the gym can make for an exercise; null is the equipment's default step. */
  gridFor: (exerciseId: string, equipment: Equipment) => LoadGrid | null;
  /** The gym's own setting of an exercise (ranges and setup note), if any. */
  settingFor: (exerciseId: string) => GymExerciseSettingRow | undefined;
};

export const NO_GYM_LOADS: GymLoads = {
  gymId: null,
  gridFor: () => null,
  settingFor: () => undefined,
};

const STANDARD_BAR_KG = { kg: 20, lb: 45 * KG_PER_LB } as const satisfies Record<
  WeightUnit,
  number
>;

/**
 * The gym's barbell for progression: the plain (unlabelled) enabled bar of the preferred unit
 * nearest the standard 20 kg or 45 lb, else any enabled plain bar, else null (a bar-less kit).
 */
export function standardBar(
  rows: readonly EquipmentRow[],
  unit: WeightUnit,
): { weightKg: number; unit: WeightUnit } | null {
  const plain = rows.filter((row) => row.kind === "bar" && row.enabled && row.label === null);
  const inUnit = plain.filter((row) => row.unit === unit);
  const pool = inUnit.length > 0 ? inUnit : plain;
  const nearest = [...pool].sort(
    (a, b) =>
      Math.abs(a.weightKg - STANDARD_BAR_KG[unit]) - Math.abs(b.weightKg - STANDARD_BAR_KG[unit]),
  )[0];
  return nearest ? { weightKg: nearest.weightKg, unit: nearest.unit } : null;
}

/** The enabled plates of the bar's own unit. */
export function platesOfUnit(rows: readonly EquipmentRow[], unit: WeightUnit): LoadPlate[] {
  return rows.flatMap((row) =>
    row.kind === "plate" && row.enabled && row.unit === unit
      ? [{ id: row.id, weightKg: row.weightKg, count: row.count }]
      : [],
  );
}

/** Loads of the active gym from its exercise settings and its kit. */
export function buildGymLoads(input: {
  gymId: string | null;
  settings: readonly GymExerciseSettingRow[];
  kit: readonly EquipmentRow[];
  unit: WeightUnit;
}): GymLoads {
  const byExercise = new Map(input.settings.map((setting) => [setting.exerciseId, setting]));
  const bar = standardBar(input.kit, input.unit);
  const plates = bar ? platesOfUnit(input.kit, bar.unit) : [];
  const grids = new Map<string, LoadGrid | null>();
  return {
    gymId: input.gymId,
    settingFor: (exerciseId) => byExercise.get(exerciseId),
    gridFor(exerciseId, equipment) {
      const key = `${exerciseId}|${equipment}`;
      if (!grids.has(key)) {
        grids.set(
          key,
          loadGridOf({
            equipment,
            ranges: byExercise.get(exerciseId)?.loadRanges,
            bar,
            plates,
          }),
        );
      }
      return grids.get(key) ?? null;
    },
  };
}

/**
 * The gym the user trains at: the one they chose if it still exists, else the oldest (the default
 * gym). Null with no gyms yet.
 */
export function resolveActiveGym(gyms: readonly GymRow[], chosen: string | null): string | null {
  return gyms.find((gym) => gym.id === chosen)?.id ?? gyms[0]?.id ?? null;
}
