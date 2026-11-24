import { useCallback } from "react";
import {
  rangesFromLimits,
  limitsOfRanges,
  defaultRangesFor,
  type Equipment,
  type WeightUnit,
} from "@workspace/shared";
import { setGymExerciseSetting, type TrainingDatabase } from "@workspace/sync";

import { useGyms } from "./use-gyms";
import { useGymLoads } from "./use-gym-loads";

/**
 * One exercise's setting at the active gym: its max load, load step and setup note, read as
 * plain values and written back as ranges. Writes nothing without a gym.
 */
export function useGymSetting(exerciseId: string, equipment: Equipment, unit: WeightUnit) {
  const { activeGymId, run, writeScope } = useGyms();
  const loads = useGymLoads();
  const setting = loads.settingFor(exerciseId);
  const limits = limitsOfRanges(setting?.loadRanges ?? []);
  const write = useCallback(
    (patch: Parameters<typeof setGymExerciseSetting>[2]) =>
      activeGymId === null
        ? Promise.resolve(null)
        : run((db: TrainingDatabase) =>
            setGymExerciseSetting(db, { gymId: activeGymId, exerciseId }, patch, writeScope),
          ),
    [activeGymId, run, exerciseId, writeScope],
  );
  /** Saves the max and step (kilograms); null clears one. */
  const setLimits = useCallback(
    (next: { maxKg: number | null; stepKg: number | null }) =>
      write({ load_ranges: rangesFromLimits(next, defaultRangesFor(equipment, unit)) }),
    [write, equipment, unit],
  );
  const setNote = useCallback(
    (note: string | null) =>
      write({ setup_note: note === null || note.trim() === "" ? null : note.trim() }),
    [write],
  );
  return {
    ready: activeGymId !== null,
    maxKg: limits.maxKg,
    // A step the user never set reads as empty, not as the equipment's own.
    stepKg: setting && setting.loadRanges.length > 0 ? limits.stepKg : null,
    note: setting?.setupNote ?? null,
    setLimits,
    setNote,
    gymId: activeGymId,
  };
}
