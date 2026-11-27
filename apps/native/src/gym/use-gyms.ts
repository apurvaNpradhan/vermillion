import { useCallback, useMemo } from "react";
import {
  createGym,
  deleteGym,
  renameGym,
  setSessionGym,
  TrainingLimitError,
  watchGyms,
  type GymRow,
  type TrainingDatabase,
} from "@workspace/sync";
import { isNetworkError } from "@workspace/client/network-error";

import { useTranslation } from "@/platform/i18n";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { usePreferences } from "@/preferences";
import { useLocalData, useSyncValue } from "@/sync";

import { resolveActiveGym } from "./gym-loads";

/**
 * The user's gyms and the one they train at. With one gym everything about gyms stays hidden:
 * `multiple` is false until a second exists.
 */
export function useGyms() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const writeScope = useSyncValue((snapshot) => snapshot?.writeScope ?? "");
  const database = local?.status === "ready" ? local.database : null;
  const { preferences, setUi } = usePreferences();
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (rows: GymRow[]) => void, onError: () => void) =>
      watchGyms(db, { onGyms: onValue, onError: () => onError() }),
    [],
  );
  const state = useLocalWatch(subscribe);
  const gyms = useMemo(() => state.value ?? [], [state.value]);
  const activeGymId = resolveActiveGym(gyms, preferences.ui.activeGymId);
  const activeGym = gyms.find((gym) => gym.id === activeGymId) ?? null;

  const run = useCallback(
    async <T>(action: (db: TrainingDatabase) => Promise<T>): Promise<T | null> => {
      try {
        if (!database) throw new Error("Local storage unavailable");
        return await action(database);
      } catch (error) {
        if (error instanceof Error && isNetworkError(error)) return null;
        toast.show({
          variant: "danger",
          label:
            error instanceof TrainingLimitError && error.limit === "liveGyms"
              ? t("gym__limit_gyms")
              : t("errors__unknown"),
        });
        return null;
      }
    },
    [database, toast, t],
  );

  return {
    gyms,
    ready: state.value !== undefined,
    failed: state.failed,
    activeGymId,
    activeGym,
    /** The oldest gym: where kit written before gyms existed lives. */
    defaultGymId: gyms[0]?.id ?? null,
    multiple: gyms.length > 1,
    nameOf: (id: string | null) => gyms.find((gym) => gym.id === id)?.name ?? null,
    select: useCallback((id: string) => setUi({ activeGymId: id }), [setUi]),
    /** Makes a gym with the active gym's kit; returns its id. */
    create: useCallback(
      (name: string) => run((db) => createGym(db, { name, copyKitFrom: activeGymId }, writeScope)),
      [run, activeGymId, writeScope],
    ),
    rename: useCallback(
      (id: string, name: string) => run((db) => renameGym(db, id, name, writeScope)),
      [run, writeScope],
    ),
    /** Deletes a gym; false when it is the last one. */
    remove: useCallback(
      async (id: string) => {
        const done = await run((db) => deleteGym(db, id, writeScope));
        if (done && id === activeGymId) setUi({ activeGymId: null });
        return done === true;
      },
      [run, writeScope, activeGymId, setUi],
    ),
    /** Changes the live Session's gym. Any gym leaves the active gym as it was. */
    setForSession: useCallback(
      async (sessionId: string, gymId: string | null) => {
        const changed = await run((db) => setSessionGym(db, sessionId, gymId, writeScope));
        if (changed && gymId !== null) setUi({ activeGymId: gymId });
      },
      [run, setUi, writeScope],
    ),
    run,
    writeScope,
  };
}
