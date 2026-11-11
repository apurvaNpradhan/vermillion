import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { loadBar, type GymEquipmentInput, type WeightUnit } from "@workspace/shared";
import {
  deleteEquipment,
  restoreEquipment,
  seedEquipment,
  setExerciseSetting,
  upsertEquipment,
  watchEquipment,
  type EquipmentRow,
  type TrainingDatabase,
} from "@workspace/sync";
import { useToast } from "heroui-native";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useTranslation } from "@/platform/i18n";
import { usePreferences } from "@/preferences";
import { useLocalData, useSyncStatus } from "@/sync";
import {
  canSeedEquipment,
  defaultBar,
  enabledBars,
  hasTarget,
  loadInputKey,
  missingKitItems,
  platesForBar,
} from "./plate-view";

/** Write scopes whose empty inventory this app run has already seeded. */
const seededScopes = new Set<string>();

/** Owns all calculator inventory reads and writes, including account-scoped errors and Undo. */
export function useEquipment(enabled = true) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const database = local?.status === "ready" ? local.database : null;
  const scope = snapshot?.writeScope ?? "";
  const { preferences, isLoading } = usePreferences();
  const unit = preferences.ui.weightUnit;
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (rows: EquipmentRow[]) => void, onError: () => void) => {
      if (!enabled) {
        onValue([]);
        return () => undefined;
      }
      return watchEquipment(db, { onEquipment: onValue, onError });
    },
    [enabled],
  );
  const state = useLocalWatch(subscribe);
  const run = useCallback(
    async <T>(action: (db: TrainingDatabase) => Promise<T>): Promise<T | null> => {
      try {
        if (!database) throw new Error("Local storage unavailable");
        return await action(database);
      } catch {
        toast.show({ variant: "danger", label: t("plates__error") });
        return null;
      }
    },
    [database, toast, t],
  );
  const hasSynced = snapshot?.hasSynced === true;
  const loaded = state.value !== undefined;
  const rowCount = state.value?.length ?? 0;
  // The first sync may deliver the account's own kit, so the default kit goes in only after it,
  // into an inventory that loaded empty, and once per write scope.
  useEffect(() => {
    if (!enabled || !database || isLoading) return;
    if (
      !canSeedEquipment({
        hasSynced,
        scope: snapshot?.writeScope ?? null,
        loaded,
        rowCount,
        alreadySeeded: seededScopes.has(scope),
      })
    )
      return;
    seededScopes.add(scope);
    void run((db) => seedEquipment(db, unit, scope)).then((done) => {
      if (done === null) seededScopes.delete(scope);
    });
  }, [
    enabled,
    database,
    isLoading,
    hasSynced,
    snapshot?.writeScope,
    loaded,
    rowCount,
    unit,
    scope,
    run,
  ]);
  const save = (item: GymEquipmentInput & { id?: string }) =>
    run((db) => upsertEquipment(db, [item], scope));
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
      : run((db) => upsertEquipment(db, items, scope));
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
    unit,
    hasSynced,
    save,
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
export function usePlates(targetKg: number, exerciseId: string, enabled = true) {
  const equipment = useEquipment(enabled);
  const { run, scope } = equipment;
  const [selected, setSelected] = useState<{
    exerciseId: string;
    scope: string;
    id: string;
  } | null>(null);
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (barId: string | null) => void, onError: () => void) => {
      const controller = new AbortController();
      if (!enabled || !exerciseId) {
        onValue(null);
        return () => controller.abort();
      }
      db.watchWithCallback(
        "SELECT bar_id FROM exercise_setting WHERE exercise_id = ?",
        [exerciseId, enabled],
        {
          onResult: (result) => {
            const parsed = z
              .array(z.object({ bar_id: z.string().nullable() }))
              .safeParse(result.array);
            if (parsed.success) onValue(parsed.data[0]?.bar_id ?? null);
            else onError();
          },
          onError,
        },
        { signal: controller.signal, tables: ["exercise_setting"] },
      );
      return () => controller.abort();
    },
    [exerciseId, enabled],
  );
  const remembered = useLocalWatch(subscribe);
  const bars = useMemo(() => enabledBars(equipment.rows), [equipment.rows]);
  const bar = defaultBar(
    bars,
    selected?.exerciseId === exerciseId && selected.scope === scope
      ? selected.id
      : remembered.value,
    equipment.unit,
  );
  const plates = bar ? platesForBar(equipment.rows, bar) : [];
  const target = useDeferredValue(targetKg);
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
    failed: equipment.failed || remembered.failed,
    loading: equipment.loading || remembered.loading,
    retry: () => {
      equipment.retry();
      remembered.retry();
    },
    bars,
    bar,
    /** The unit the calculator works in: the bar's own. */
    barUnit: bar?.unit ?? equipment.unit,
    plates,
    target,
    chooseBar,
    result,
  };
}
