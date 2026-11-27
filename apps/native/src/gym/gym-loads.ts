import {
  gymGridsOf,
  isEquipmentAvailable,
  type Equipment,
  type LoadGrid,
  type LoadRange,
  type WeightUnit,
} from "@workspace/shared";
import type { EquipmentRow, GymExerciseSettingRow, GymRow } from "@workspace/sync";

/** What one gym says about loads, read by progression, the plate calculator and the editors. */
export type GymLoads = {
  ready?: boolean;
  /** The gym these loads are of; null before the first sync has delivered one. */
  gymId: string | null;
  /** The loads the gym can make for an exercise; null is the equipment's default step. */
  gridFor: (
    exerciseId: string,
    equipment: Equipment,
    override?: WeightUnit | null,
  ) => LoadGrid | null;
  /** The gym's own setting of an exercise (ranges and setup note), if any. */
  settingFor: (exerciseId: string) => GymExerciseSettingRow | undefined;
  /**
   * The ranges the gym gives an exercise: its own setting's, and for a dumbbell exercise held to
   * the gym's dumbbell max (the lower cap wins).
   */
  rangesFor: (exerciseId: string, equipment: Equipment) => readonly LoadRange[];
  /** The equipment types the gym lacks. */
  unavailableEquipment: readonly Equipment[];
  /** Whether the gym has the equipment; bodyweight is always there. */
  hasEquipment: (equipment: Equipment) => boolean;
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
  /** The heaviest dumbbell of the gym in kilograms; it caps every dumbbell exercise. */
  dumbbellMaxKg?: number | null;
  unavailableEquipment?: readonly Equipment[];
}): GymLoads {
  const byExercise = new Map(input.settings.map((setting) => [setting.exerciseId, setting]));
  const grids = gymGridsOf(input);
  const unavailableEquipment = input.unavailableEquipment ?? [];
  return {
    gymId: input.gymId,
    settingFor: (exerciseId) => byExercise.get(exerciseId),
    rangesFor: grids.rangesFor,
    unavailableEquipment,
    hasEquipment: (equipment) => isEquipmentAvailable(equipment, unavailableEquipment),
    gridFor: grids.gridFor,
  };
}

/**
 * The gym the user trains at: the one they chose if it still exists, else the oldest (the default
 * gym). Null with no gyms yet.
 */
export function resolveActiveGym(gyms: readonly GymRow[], chosen: string | null): string | null {
  return gyms.find((gym) => gym.id === chosen)?.id ?? gyms[0]?.id ?? null;
}
