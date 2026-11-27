import { isEquipmentAvailable, type Equipment } from "@workspace/shared";
import { setGymAvailability, setGymEquipmentHere } from "@workspace/sync";
import { useCallback, useMemo } from "react";

import { useGyms } from "./use-gyms";

/**
 * What one gym says about its equipment: the types it lacks and its heaviest dumbbell. With no
 * `gymId` it is the gym trained at. `ready` is false until the first sync has delivered a gym.
 */
export function useGymAvailability(forGymId?: string | null) {
  const { gyms, activeGymId, run, writeScope } = useGyms();
  const gymId = forGymId ?? activeGymId;
  const gym = gyms.find((entry) => entry.id === gymId) ?? null;
  const unavailable = useMemo(() => gym?.unavailableEquipment ?? [], [gym]);
  const save = useCallback(
    async (patch: { unavailableEquipment?: Equipment[]; dumbbellMaxKg?: number | null }) => {
      if (!gymId) return false;
      return (await run((db) => setGymAvailability(db, gymId, patch, writeScope))) === true;
    },
    [gymId, run, writeScope],
  );
  return {
    gymId,
    gymName: gym?.name ?? null,
    ready: gym !== null,
    unavailable,
    dumbbellMaxKg: gym?.dumbbellMaxKg ?? null,
    has: (equipment: Equipment) => isEquipmentAvailable(equipment, unavailable),
    /** Ticks one equipment type on or off. */
    setHas: async (equipment: Equipment, here: boolean) => {
      if (!gymId) return false;
      return (
        (await run((db) => setGymEquipmentHere(db, gymId, equipment, here, writeScope))) === true
      );
    },
    setDumbbellMax: (kg: number | null) => save({ dumbbellMaxKg: kg }),
  };
}
