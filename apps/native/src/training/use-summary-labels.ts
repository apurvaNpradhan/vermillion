import { useMemo } from "react";

import { useTranslation } from "@/platform/i18n";

import type { SummaryLabels } from "./summarise-sets";

/** The translated words `summariseSets` and the target fields format with. */
export function useSummaryLabels(): SummaryLabels {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      warmup: (count) => t("training__summary_warmup", { count }),
      sets: (count) => t("training__summary_sets", { count }),
      seconds: (value) => t("training__duration_seconds", { value }),
      minutes: (value) => t("training__duration_minutes", { value }),
      minutesSeconds: (minutes, seconds) =>
        t("training__duration_minutes_seconds", { minutes, seconds }),
      meters: (value) => t("training__distance_meters", { value }),
      kilometers: (value) => t("training__distance_kilometers", { value }),
      floors: (value) => t("training__floors_value", { count: value }),
      steps: (value) => t("training__steps_value", { count: value }),
      weight: (value, unit) =>
        t("training__weight_value", {
          value,
          unit: t(unit === "kg" ? "training__unit_kg" : "training__unit_lb"),
        }),
      effort: (scale, value) =>
        t("training__effort_value", {
          scale: t(scale === "rpe" ? "training__effort_rpe" : "training__effort_rir"),
          value,
        }),
      restOff: t("training__rest_off_summary"),
    }),
    [t],
  );
}
