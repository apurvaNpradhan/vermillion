import { useTranslation } from "@/platform/i18n";

import type { RotationSummary } from "./rotation";

/** `4 days · 6-day rotation · 12 weeks`, or "No workouts yet" for an empty Rotation. */
export function useProgramMeta(summary: RotationSummary, plannedWeeks: number | null): string {
  const { t } = useTranslation();
  if (summary.rotationDays === 0) {
    return [
      t("training__program_meta_empty"),
      ...(plannedWeeks === null
        ? []
        : [t("training__program_meta_weeks", { count: plannedWeeks })]),
    ].join(" · ");
  }
  return [
    t("training__program_meta_days", { count: summary.trainingDays }),
    ...(summary.showRotation
      ? [t("training__program_meta_rotation", { count: summary.rotationDays })]
      : []),
    ...(plannedWeeks === null ? [] : [t("training__program_meta_weeks", { count: plannedWeeks })]),
  ].join(" · ");
}
