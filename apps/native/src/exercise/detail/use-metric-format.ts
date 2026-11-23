import { addsLoad, KG_PER_LB, type ExerciseType, type WeightUnit } from "@workspace/shared";

import { useTranslation } from "@/platform/i18n";

import type { Metric } from "./numbers";
import { useHumanUnits } from "./use-human-units";

const LABELS = {
  most_reps: "exercise__metric_most_reps",
  heaviest_weight: "exercise__metric_heaviest",
  estimated_one_rep_max: "exercise__metric_one_rm",
  set_volume: "exercise__metric_set_volume",
  session_volume: "exercise__metric_session_volume",
  total_reps: "exercise__metric_reps",
  longest_duration: "exercise__metric_duration",
  longest_distance: "exercise__metric_distance",
  best_pace: "exercise__metric_pace",
  floors: "exercise__metric_floors",
  steps: "exercise__metric_steps",
} as const;

function isMetricLabel(key: Metric): key is keyof typeof LABELS {
  return key in LABELS;
}

/**
 * How a metric is named and written for an exercise type: weights in the user's unit, durations
 * as 40:00, distances as 7.0 km (850 m below a kilometre) and pace as 5:43 /km.
 */
export function useMetricFormat(type: ExerciseType, unit: WeightUnit) {
  const { t, i18n } = useTranslation();
  const human = useHumanUnits();
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value);
  const label = (key: Metric) =>
    key.startsWith("reps_")
      ? t("exercise__record_reps", { count: Number(key.slice(5)) })
      : key === "heaviest_weight" && addsLoad(type)
        ? t("exercise__metric_added_load")
        : t(LABELS[isMetricLabel(key) ? key : "total_reps"]);
  const format = (value: number, key: Metric) => {
    if (key === "longest_duration") return human.duration(value);
    if (key === "longest_distance") return human.distance(value);
    if (key === "best_pace") return human.pace(value);
    if (key === "most_reps" || key === "total_reps" || key === "floors" || key === "steps")
      return number(value);
    const added = addsLoad(type) && (key === "heaviest_weight" || key.startsWith("reps_"));
    return t(
      key === "set_volume" || key === "session_volume"
        ? "exercise__value_volume"
        : added
          ? "exercise__value_added_weight"
          : "exercise__value_weight",
      { value: number(unit === "lb" ? value / KG_PER_LB : value), unit },
    );
  };
  return { label, format, number };
}
