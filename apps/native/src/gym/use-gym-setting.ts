import {
  rangesFromLimits,
  limitsOfRanges,
  defaultRangesFor,
  type Equipment,
  type WeightUnit,
} from "@workspace/shared";
import { setGymExerciseSetting } from "@workspace/sync";

import { useGyms } from "./use-gyms";
import { useGymExerciseSettings } from "./use-gym-loads";

/** Exercise settings at the active gym and a single write for the fields being edited. */
export function useGymSetting(exerciseId: string, equipment: Equipment, unit: WeightUnit) {
  const { activeGymId, activeGym, multiple, run, writeScope } = useGyms();
  const settings = useGymExerciseSettings(activeGymId);
  const setting = settings.value?.find((entry) => entry.exerciseId === exerciseId);
  const { maxKg, stepKg } = limitsOfRanges(setting?.loadRanges ?? []);
  const ready = activeGymId !== null && settings.value !== undefined;
  const save = async (input: {
    limits?: { maxKg: number | null; stepKg: number | null };
    note?: string;
  }) => {
    if (!ready || activeGymId === null) return false;
    if (!input.limits && input.note === undefined) return true;
    const patch: Parameters<typeof setGymExerciseSetting>[2] = {};
    if (input.limits)
      patch.load_ranges = rangesFromLimits(input.limits, defaultRangesFor(equipment, unit));
    if (input.note !== undefined) patch.setup_note = input.note.trim() || null;
    return (
      (await run(async (db) => {
        await setGymExerciseSetting(db, { gymId: activeGymId, exerciseId }, patch, writeScope);
        return true;
      })) === true
    );
  };
  return {
    ready,
    maxKg,
    stepKg,
    note: setting?.setupNote ?? null,
    save,
    gymId: activeGymId,
    gymName: multiple ? activeGym?.name : undefined,
  };
}
