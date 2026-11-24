import { useCallback, useMemo } from "react";
import {
  watchEquipment,
  watchGymExerciseSettings,
  type EquipmentRow,
  type GymExerciseSettingRow,
  type TrainingDatabase,
} from "@workspace/sync";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreference } from "@/preferences";

import { buildGymLoads, NO_GYM_LOADS, type GymLoads } from "./gym-loads";
import { useGyms } from "./use-gyms";

/**
 * The loads of the active gym: its exercise settings and its kit, as one memoised value.
 * `NO_GYM_LOADS` until the first sync has delivered a gym.
 */
export function useGymLoads(): GymLoads {
  const { activeGymId, defaultGymId } = useGyms();
  const unit = usePreference((preferences) => preferences.ui.weightUnit);
  const settingsSubscribe = useCallback(
    (
      db: TrainingDatabase,
      onValue: (rows: GymExerciseSettingRow[]) => void,
      onError: () => void,
    ) => {
      if (!activeGymId) {
        onValue([]);
        return () => undefined;
      }
      return watchGymExerciseSettings(db, activeGymId, {
        onSettings: onValue,
        onError: () => onError(),
      });
    },
    [activeGymId],
  );
  const kitSubscribe = useCallback(
    (db: TrainingDatabase, onValue: (rows: EquipmentRow[]) => void, onError: () => void) =>
      watchEquipment(
        db,
        { onEquipment: onValue, onError: () => onError() },
        { gymId: activeGymId, unassigned: activeGymId === null || activeGymId === defaultGymId },
      ),
    [activeGymId, defaultGymId],
  );
  const settings = useLocalWatch(settingsSubscribe).value;
  const kit = useLocalWatch(kitSubscribe).value;
  return useMemo(
    () =>
      activeGymId === null
        ? NO_GYM_LOADS
        : buildGymLoads({ gymId: activeGymId, settings: settings ?? [], kit: kit ?? [], unit }),
    [activeGymId, settings, kit, unit],
  );
}
