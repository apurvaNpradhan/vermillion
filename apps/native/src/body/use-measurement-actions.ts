import { useState } from "react";
import {
  logMeasurements,
  updateMeasurement,
  deleteMeasurement,
  restoreMeasurement,
  type WatchedMeasurement,
} from "@workspace/sync";
import { measurementInput, type MeasurementInput } from "@workspace/shared";
import { useLocalData, useSyncValue } from "@/sync";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useTranslation } from "@/platform/i18n";
export function useMeasurementActions() {
  const local = useLocalData();
  const scope = useSyncValue((s) => s?.writeScope ?? "");
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const database = () => {
    if (local?.status !== "ready") throw new Error("Storage unavailable");
    return local.database;
  };
  const run = async (write: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await write();
      return true;
    } catch {
      setError(t("errors__unknown"));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    error,
    async save(entries: MeasurementInput[]) {
      if (entries.some((e) => !measurementInput.safeParse(e).success)) {
        setError(t("body__invalid"));
        return false;
      }
      return run(async () => {
        await logMeasurements(database(), entries, scope);
      });
    },
    /** Patches one entry with only the fields the user changed. */
    async edit(entry: WatchedMeasurement, patch: Partial<MeasurementInput>) {
      const merged = {
        metric: entry.metric,
        value: patch.value ?? entry.value,
        measured_at: patch.measured_at ?? entry.measured_at,
        local_date: patch.local_date ?? entry.local_date,
        source: entry.source,
      };
      if (!measurementInput.safeParse(merged).success) {
        setError(t("body__invalid"));
        return false;
      }
      return run(async () => {
        await updateMeasurement(database(), entry.id, patch, scope);
      });
    },
    async remove(entry: WatchedMeasurement) {
      try {
        const row = await deleteMeasurement(database(), entry.id, scope);
        if (row)
          toast.show({
            label: t("body__deleted"),
            actionLabel: t("common__undo"),
            onActionPress: ({ hide }) => {
              hide();
              void restoreMeasurement(database(), row, scope).catch(() =>
                toast.show({ label: t("errors__unknown"), variant: "danger" }),
              );
            },
          });
      } catch {
        toast.show({ label: t("errors__unknown"), variant: "danger" });
      }
    },
  };
}
