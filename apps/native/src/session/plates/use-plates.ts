import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  loadBar,
  type Equipment,
  type GymEquipmentInput,
  type WeightUnit,
  barsInUnit,
  resolveExerciseUnit,
} from "@workspace/shared";
import {
  deleteEquipment,
  restoreEquipment,
  seedEquipment,
  setExerciseSetting,
  upsertEquipment,
  updateEquipment,
  type EquipmentPatch,
  watchEquipment,
  watchExerciseBar,
  type EquipmentRow,
  type TrainingDatabase,
} from "@workspace/sync";
import { isNetworkError } from "@workspace/client/network-error";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useTranslation } from "@/platform/i18n";
import { usePreferences } from "@/preferences";
import { useGyms, useGymCap } from "@/gym";
import { useLocalData, useSyncValue } from "@/sync";
import {
  canSeedEquipment,
  defaultBar,
  enabledBars,
  hasTarget,
  loadInputKey,
  missingBarLabel,
  missingKitItems,
  platesForBar,
} from "./plate-view";

/** Write scopes whose empty inventory this app run has already seeded. */
const seededScopes = new Set<string>();

/**
 * Owns all calculator inventory reads and writes, including account-scoped errors and Undo. With no
 * `gymId` it is the kit of the gym trained at and seeds the default kit into an empty inventory;
 * the kit screen of one gym passes its id and does not seed, and a Session passes its own with
 * `seed` on (its gym may be the only one the account has).
 */
export function useEquipment(enabled = true, gymId?: string, seed = gymId === undefined) {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const writeScope = useSyncValue((snapshot) => snapshot?.writeScope ?? null);
  const hasSynced = useSyncValue((snapshot) => snapshot?.hasSynced === true);
  const indicator = useSyncValue((snapshot) => snapshot?.indicator ?? null);
  const database = local?.status === "ready" ? local.database : null;
  const scope = writeScope ?? "";
  const { preferences, isLoading } = usePreferences();
  const unit = preferences.ui.weightUnit;
  const { activeGymId: preferredGymId, defaultGymId, ready: gymsReady } = useGyms();
  const activeGymId = gymId ?? preferredGymId;
  const unassigned = activeGymId === null || activeGymId === defaultGymId;
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (rows: EquipmentRow[]) => void, onError: () => void) => {
      if (!enabled) {
        onValue([]);
        return () => undefined;
      }
      return watchEquipment(
        db,
        { onEquipment: onValue, onError },
        { gymId: activeGymId, unassigned },
      );
    },
    [enabled, activeGymId, unassigned],
  );
  const state = useLocalWatch(subscribe);
  const run = useCallback(
    async <T>(action: (db: TrainingDatabase) => Promise<T>): Promise<T | null> => {
      try {
        if (!database) throw new Error("Local storage unavailable");
        return await action(database);
      } catch (error) {
        if (error instanceof Error && isNetworkError(error)) return null;
        toast.show({ variant: "danger", label: t("plates__error") });
        return null;
      }
    },
    [database, toast, t],
  );
  const loaded = state.value !== undefined;
  const rowCount = state.value?.length ?? 0;
  // The first sync may deliver the account's own kit, so the default kit goes in only after it,
  // into an inventory that loaded empty, and once per write scope.
  useEffect(() => {
    if (!enabled || !seed || !database || isLoading || (hasSynced && activeGymId === null)) return;
    if (
      !canSeedEquipment({
        hasSynced,
        scope: writeScope,
        loaded,
        rowCount,
        alreadySeeded: seededScopes.has(scope),
      })
    )
      return;
    seededScopes.add(scope);
    void run((db) => seedEquipment(db, scope, activeGymId ?? undefined)).then((done) => {
      if (done === null) seededScopes.delete(scope);
    });
  }, [
    enabled,
    seed,
    database,
    isLoading,
    hasSynced,
    writeScope,
    loaded,
    rowCount,
    scope,
    run,
    activeGymId,
  ]);
  const save = (item: GymEquipmentInput & { id?: string }) =>
    run((db) => upsertEquipment(db, [item], scope, activeGymId));
  const edit = (id: string, patch: EquipmentPatch) =>
    run((db) => updateEquipment(db, id, patch, scope));
  const toggle = (item: EquipmentRow) =>
    save({
      id: item.id,
      kind: item.kind,
      weight_kg: item.weightKg,
      unit: item.unit,
      label: item.label,
      count: item.count,
      enabled: !item.enabled,
    });
  /** Adds a unit's default kit without duplicating what the inventory already holds. */
  const addKit = (kitUnit: WeightUnit) => {
    const items = missingKitItems(state.value ?? [], kitUnit);
    return items.length === 0
      ? Promise.resolve([])
      : run((db) => upsertEquipment(db, items, scope, activeGymId));
  };
  const remove = async (item: EquipmentRow) => {
    const deleted = await run((db) => deleteEquipment(db, item.id, scope));
    if (!deleted) return;
    toast.show({
      label: t("plates__deleted"),
      actionLabel: t("plates__undo"),
      duration: 5000,
      onActionPress: ({ hide }) => {
        hide();
        void run((db) => restoreEquipment(db, deleted, scope));
      },
    });
  };
  return {
    ...state,
    rows: state.value ?? [],
    gymId: activeGymId,
    gymsReady,
    unit,
    hasSynced,
    indicator,
    save,
    edit,
    toggle,
    addKit,
    remove,
    run,
    scope,
  };
}

/**
 * The calculator's state for one exercise. Enable it only while the calculator is open: it
 * watches the equipment and the exercise's remembered bar, and solves the load.
 */
export function usePlates(
  targetKg: number,
  exerciseId: string,
  enabled = true,
  equipmentKind?: Equipment,
  /** The Session's gym: its kit and its cap. None (or null) is the gym trained at. */
  gymId?: string | null,
  unitOverride?: WeightUnit | null,
) {
  const equipment = useEquipment(enabled, gymId ?? undefined, true);
  const { run, scope } = equipment;
  const [selected, setSelected] = useState<{
    exerciseId: string;
    scope: string;
    id: string;
  } | null>(null);
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (barId: string | null) => void, onError: () => void) => {
      if (!enabled || !exerciseId) {
        onValue(null);
        return () => undefined;
      }
      return watchExerciseBar(db, exerciseId, { onBar: onValue, onError });
    },
    [exerciseId, enabled],
  );
  const remembered = useLocalWatch(subscribe);
  const preferred = resolveExerciseUnit(equipment.unit, unitOverride);
  const bars = useMemo(() => {
    const enabled = enabledBars(equipment.rows);
    return unitOverride == null ? enabled : barsInUnit(enabled, preferred);
  }, [equipment.rows, preferred, unitOverride]);
  const bar = defaultBar(
    bars,
    selected?.exerciseId === exerciseId && selected.scope === scope
      ? selected.id
      : remembered.value,
    preferred,
    equipmentKind,
  );
  const plates = bar ? platesForBar(equipment.rows, bar) : [];
  // The gym's max for this exercise is the most the calculator offers.
  const gymCap = useGymCap(enabled ? equipment.gymId : null, exerciseId);
  const { cap } = gymCap;
  const wanted = useDeferredValue(targetKg);
  const target = cap !== null && wanted > cap ? cap : wanted;
  // The inventory emits a new array on every change; solve again only when the bar, a plate that
  // matters to the solver or the target changes.
  const inputKey = loadInputKey(bar, plates);
  const result = useMemo(
    () => (enabled && bar && hasTarget(target) ? loadBar(target, bar, plates) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `inputKey` stands for `bar` and `plates`.
    [inputKey, target, enabled],
  );
  const chooseBar = async (id: string) => {
    if (exerciseId) {
      const saved = await run((db) => setExerciseSetting(db, exerciseId, { bar_id: id }, scope));
      if (saved === null) return false;
    }
    setSelected({ exerciseId, scope, id });
    return true;
  };
  return {
    ...equipment,
    failed: equipment.failed || remembered.failed || gymCap.failed,
    loading:
      equipment.loading ||
      remembered.loading ||
      gymCap.loading ||
      (equipment.hasSynced && !equipment.gymsReady),
    retry: () => {
      equipment.retry();
      remembered.retry();
      gymCap.retry();
    },
    bars,
    bar,
    /** The "EZ" or "Trap" bar this exercise opens on, when the kit has no such bar. */
    missingBar: missingBarLabel(bars, equipmentKind),
    /** The unit of the physical plates, which must match the bar. */
    barUnit: bar?.unit ?? preferred,
    /** Loads are shown in the exercise unit, including when the kit is in another unit. */
    displayUnit: preferred,
    plates,
    target,
    cap,
    chooseBar,
    result,
  };
}
