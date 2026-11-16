import type { EffortScale, WeightUnit } from "@workspace/shared";

import { useTranslation } from "@/platform/i18n";

import type { SetColumn } from "./set-text-rows";

/** The header text of each read-only set-table column; the table shows it in muted caps. */
export function useColumnHeaders() {
  const { t } = useTranslation();
  return (column: SetColumn, unit: WeightUnit, scale: EffortScale): string => {
    switch (column) {
      case "weight":
        return t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
      case "reps":
        return t("training__field_reps");
      case "effort":
        return t(scale === "rpe" ? "training__effort_rpe" : "training__effort_rir");
      case "duration":
        return t("training__field_duration");
      case "distance":
        return t("training__unit_m");
      case "floors":
        return t("training__field_floors");
      case "steps":
        return t("training__field_steps");
    }
  };
}
