import {
  defaultBar,
  enabledBars,
  loadGridOf,
  platesForBar,
  type Equipment,
  type LoadGrid,
  type WeightUnit,
} from "@workspace/shared";
import type { EquipmentRow, GymExerciseSettingRow, GymRow } from "@workspace/sync";

/** What one gym says about loads, read by progression, the plate calculator and the editors. */
export type GymLoads = {
  /** The gym these loads are of; null before the first sync has delivered one. */
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

/**
 * Loads of one gym from its exercise settings and its kit. A barbell loads with its own bar: the
 * one the exercise remembers when this gym has it, else the gym's default bar (a bar remembered
 * from another gym is not in `kit`).
 */
export function buildGymLoads(input: {
  gymId: string | null;
  settings: readonly GymExerciseSettingRow[];
  kit: readonly EquipmentRow[];
  /** The bar each exercise remembers, by exercise id. */
  bars?: ReadonlyMap<string, string>;
  unit: WeightUnit;
}): GymLoads {
  const byExercise = new Map(input.settings.map((setting) => [setting.exerciseId, setting]));
  const bars = enabledBars(input.kit);
  const grids = new Map<string, LoadGrid | null>();
  return {
    gymId: input.gymId,
    settingFor: (exerciseId) => byExercise.get(exerciseId),
    gridFor(exerciseId, equipment) {
      const key = `${exerciseId}|${equipment}`;
      if (!grids.has(key)) {
        const bar =
          equipment === "barbell"
            ? defaultBar(bars, input.bars?.get(exerciseId), input.unit, equipment)
            : undefined;
        grids.set(
          key,
          loadGridOf({
            equipment,
            unit: input.unit,
            ranges: byExercise.get(exerciseId)?.loadRanges,
            bar,
            plates: bar ? platesForBar(input.kit, bar) : [],
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
