import {
  logMeasurement,
  updateMeasurement,
  deleteMeasurement,
  restoreMeasurement,
  type WatchedMeasurement,
} from "@workspace/sync";
import { measurementInput, lbToKg, shownWeight } from "@workspace/shared";
import { useState } from "react";
import { useLocalData, useSyncValue } from "@/sync";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useTranslation } from "@/platform/i18n";
import { useWeight } from "./use-weight";
export function useLogWeight() {
  const local = useLocalData();
  const scope = useSyncValue((s) => s?.writeScope ?? "");
  const weight = useWeight();
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const database = () => {
    if (local?.status !== "ready") throw new Error("Storage unavailable");
    return local.database;
  };
  return {
    busy,
    async clearGoal(save: (kg: number | null) => Promise<void>) {
      setBusy(true);
      try {
        await save(null);
        return true;
      } catch {
        setError(t("errors__unknown"));
        return false;
      } finally {
        setBusy(false);
      }
    },
    error,
    async saveGoal(value: number, save: (kg: number | null) => Promise<void>) {
      const kg = weight.unit === "lb" ? lbToKg(value) : value;
      if (!Number.isFinite(kg) || kg < 20 || kg > 400) {
        setError(t("body__invalid"));
        return false;
      }
      setBusy(true);
      try {
        await save(kg);
        return true;
      } catch {
        setError(t("errors__unknown"));
        return false;
      } finally {
        setBusy(false);
      }
    },
    async save(value: number, measuredAt: string, entry?: WatchedMeasurement) {
      const parsed = measurementInput.safeParse({
        metric: "weight",
        value: weight.unit === "lb" ? lbToKg(value) : value,
        measured_at: measuredAt,
        local_date: weight.localDate(measuredAt),
        source: "manual",
      });
      if (!parsed.success) {
        setError(t("body__invalid"));
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        if (entry) {
          const patch = {
            // Compare what the field showed, not a unit round trip, so a date-only edit never
            // rewrites the weight (and never overwrites another device's correction).
            ...(Math.abs(shownWeight(entry.value, weight.unit) - value) > 1e-9
              ? { value: parsed.data.value }
              : {}),
            ...(Date.parse(entry.measured_at) !== Date.parse(measuredAt)
              ? { measured_at: measuredAt, local_date: parsed.data.local_date }
              : {}),
          };
          await updateMeasurement(database(), entry.id, patch, scope);
        } else await logMeasurement(database(), parsed.data, scope);
        return true;
      } catch {
        setError(t("errors__unknown"));
        return false;
      } finally {
        setBusy(false);
      }
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
