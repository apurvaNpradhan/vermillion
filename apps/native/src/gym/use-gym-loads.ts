import { limitsOfRanges } from "@workspace/shared";
import { useCallback, useMemo } from "react";
import {
  watchEquipment,
  watchExerciseBars,
  watchGymExerciseSettings,
  type EquipmentRow,
  type GymExerciseSettingRow,
  type TrainingDatabase,
} from "@workspace/sync";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreference } from "@/preferences";

import { buildGymLoads, type GymLoads } from "./gym-loads";
import { useGyms } from "./use-gyms";

/**
 * The loads of one gym: its exercise settings and its kit, as one memoised value. With no `gymId`
 * it is the gym trained at; a Session passes its own, and one that has none (an older Session, or
 * "Any gym") passes null and reads the gym trained at too. The default grid applies until the
 * first sync has delivered a gym.
 */
export function useGymLoads(gymId?: string | null): GymLoads {
  const { gyms, activeGymId, defaultGymId, ready: gymsReady } = useGyms();
  const wanted = gymId ?? activeGymId;
  const gym = gyms.find((entry) => entry.id === wanted);
  const dumbbellMaxKg = gym?.dumbbellMaxKg ?? null;
  const unavailable = gym?.unavailableEquipment;
  const unit = usePreference((preferences) => preferences.ui.weightUnit);
  const settings = useGymExerciseSettings(wanted).value;
  const kitSubscribe = useCallback(
    (db: TrainingDatabase, onValue: (rows: EquipmentRow[]) => void, onError: () => void) =>
      watchEquipment(
        db,
        { onEquipment: onValue, onError: () => onError() },
        // Rows from before gyms existed have no gym; they belong to the oldest one.
        { gymId: wanted, unassigned: wanted === null || wanted === defaultGymId },
      ),
    [wanted, defaultGymId],
  );
  const kit = useLocalWatch(kitSubscribe).value;
  const barsSubscribe = useCallback(
    (
      db: TrainingDatabase,
      onValue: (bars: ReadonlyMap<string, string>) => void,
      onError: () => void,
    ) => watchExerciseBars(db, { onBars: onValue, onError: () => onError() }),
    [],
  );
  const bars = useLocalWatch(barsSubscribe).value;
  return useMemo(
    () => ({
      ...buildGymLoads({
        gymId: wanted,
        settings: settings ?? [],
        kit: wanted === null ? [] : (kit ?? []),
        bars,
        unit,
        dumbbellMaxKg,
        unavailableEquipment: unavailable,
      }),
      ready: gymsReady && settings !== undefined && kit !== undefined && bars !== undefined,
    }),
    [wanted, settings, kit, bars, unit, dumbbellMaxKg, unavailable, gymsReady],
  );
}

export function useGymExerciseSettings(gymId: string | null) {
  const settingsSubscribe = useCallback(
    (
      db: TrainingDatabase,
      onValue: (rows: GymExerciseSettingRow[]) => void,
      onError: () => void,
    ) => {
      if (!gymId) {
        onValue([]);
        return () => undefined;
      }
      return watchGymExerciseSettings(db, gymId, {
        onSettings: onValue,
        onError: () => onError(),
      });
    },
    [gymId],
  );
  return useLocalWatch(settingsSubscribe);
}

/** The calculator must wait for its gym's settings before it can offer a load. */
export function useGymCap(gymId: string | null, exerciseId: string) {
  const settings = useGymExerciseSettings(gymId);
  const ranges =
    settings.value?.find((setting) => setting.exerciseId === exerciseId)?.loadRanges ?? [];
  return {
    cap: limitsOfRanges(ranges).maxKg,
    loading: settings.loading,
    failed: settings.failed,
    retry: settings.retry,
  };
}
