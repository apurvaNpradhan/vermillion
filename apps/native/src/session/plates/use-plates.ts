import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { loadBar, type GymEquipmentInput } from "@workspace/shared";
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

/** Owns all calculator inventory reads and writes, including account-scoped errors and Undo. */
export function useEquipment() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const database = local?.status === "ready" ? local.database : null;
  const scope = snapshot?.writeScope ?? "";
  const { preferences, isLoading } = usePreferences();
  const unit = preferences.ui.weightUnit;
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (rows: EquipmentRow[]) => void, onError: () => void) =>
      watchEquipment(db, { onEquipment: onValue, onError }),
    [],
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
  useEffect(() => {
    if (!database || isLoading) return;
    void run((db) => seedEquipment(db, unit, scope));
  }, [database, isLoading, unit, scope, run]);
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
  return { ...state, rows: state.value ?? [], unit, save, toggle, remove, run, scope };
}

export function usePlates(targetKg: number, exerciseId: string) {
  const equipment = useEquipment();
  const { run, scope } = equipment;
  const [selected, setSelected] = useState<{
    exerciseId: string;
    scope: string;
    id: string;
  } | null>(null);
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (barId: string | null) => void, onError: () => void) => {
      const controller = new AbortController();
      if (!exerciseId) {
        onValue(null);
        return () => controller.abort();
      }
      db.watchWithCallback(
        "SELECT bar_id FROM exercise_setting WHERE exercise_id = ?",
        [exerciseId],
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
    [exerciseId],
  );
  const remembered = useLocalWatch(subscribe);
  const bars = equipment.rows.filter((p) => p.kind === "bar" && p.enabled);
  const bar =
    bars.find(
      (p) =>
        p.id ===
        (selected?.exerciseId === exerciseId && selected.scope === scope
          ? selected.id
          : remembered.value),
    ) ??
    bars.find((p) => p.unit === equipment.unit) ??
    bars[0];
  const result = useMemo(
    () =>
      bar
        ? loadBar(
            targetKg,
            bar,
            equipment.rows.filter((p) => p.kind === "plate" && p.enabled && p.unit === bar.unit),
          )
        : null,
    [targetKg, bar, equipment.rows],
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
    chooseBar,
    result,
  };
}
