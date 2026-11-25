import { rangesFromLimits, limitsOfRanges } from "@workspace/shared";
import { setGymExerciseSetting } from "@workspace/sync";

import { useGyms } from "./use-gyms";
import { useGymExerciseSettings } from "./use-gym-loads";

/**
 * Exercise settings at one gym and a single write for the fields being edited. With no `gymId`
 * it is the gym trained at; a Session passes its own (null reads the gym trained at too).
 */
export function useGymSetting(exerciseId: string, gymId?: string | null) {
  const { activeGymId, gyms, multiple, run, writeScope } = useGyms();
  const wantedGymId = gymId ?? activeGymId;
  const gym = gyms.find((entry) => entry.id === wantedGymId) ?? null;
  const settings = useGymExerciseSettings(wantedGymId);
  const setting = settings.value?.find((entry) => entry.exerciseId === exerciseId);
  const { maxKg, stepKg } = limitsOfRanges(setting?.loadRanges ?? []);
  const ready = wantedGymId !== null && settings.value !== undefined;
  const save = async (input: {
    limits?: { maxKg: number | null; stepKg: number | null };
    note?: string;
  }) => {
    if (!ready || wantedGymId === null) return false;
    if (!input.limits && input.note === undefined) return true;
    const patch: Parameters<typeof setGymExerciseSetting>[2] = {};
    if (input.limits) patch.load_ranges = rangesFromLimits(input.limits, setting?.loadRanges ?? []);
    if (input.note !== undefined) patch.setup_note = input.note.trim() || null;
    return (
      (await run(async (db) => {
        await setGymExerciseSetting(db, { gymId: wantedGymId, exerciseId }, patch, writeScope);
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
    gymId: wantedGymId,
    gymName: multiple ? gym?.name : undefined,
  };
}
