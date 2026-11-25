import { formatLoad, type ExerciseType, type LoggedSet, type WeightUnit } from "@workspace/shared";

import { useTranslation } from "@/platform/i18n";

import { formatClock } from "./numbers";
import { useHumanUnits } from "./use-human-units";

type TextSet = Pick<
  LoggedSet,
  "weight_kg" | "reps" | "duration_s" | "distance_m" | "floors" | "steps"
>;

/**
 * A set as one line, in human units: "100 kg × 5", "+20 kg × 8", "12 reps", "40:00", "7.0 km · 40:00".
 * A weight with reps reads as one phrase; any other mix lists the numbers with a middle dot.
 */
export function useTopSetText(preferred: WeightUnit) {
  const { t, i18n } = useTranslation();
  const human = useHumanUnits();
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  return (set: TextSet, type: ExerciseType, unit = preferred): string => {
    const weight = set.weight_kg ?? 0;
    const shown = (kg: number) => formatLoad(kg, unit, type);
    if (weight > 0 && set.reps) {
      return t("progress__best", { weight: shown(weight), unit, reps: set.reps });
    }
    return [
      weight > 0 ? t("exercise__value_weight", { value: shown(weight), unit }) : null,
      set.reps ? t("exercise__value_reps", { value: number.format(set.reps) }) : null,
      set.distance_m ? human.distance(set.distance_m) : null,
      set.floors ? t("exercise__value_floors", { value: number.format(set.floors) }) : null,
      set.steps ? t("exercise__value_steps", { value: number.format(set.steps) }) : null,
      set.duration_s ? formatClock(set.duration_s) : null,
    ]
      .filter((part) => part !== null)
      .join(" · ");
  };
}
