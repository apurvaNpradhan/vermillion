import {
  SET_FIELDS,
  formatWeight,
  parseWeight,
  type EffortScale,
  type ExerciseType,
  type WeightUnit,
} from "@workspace/shared";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import type { EffortRange } from "../effort";
import { MAX_DURATION_SECONDS, stepDuration } from "../rest";
import type { Target } from "../set-editing";
import { formatSeconds } from "../summarise-sets";
import { useSummaryLabels } from "../use-summary-labels";
import { EffortSelector } from "./effort-selector";
import { NumberField } from "./number-field";
import { Stepper } from "./stepper";

const DEFAULT_REPS = 8;
const MAX_REPS = 999;

const decimal = (text: string): number | undefined | null => {
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "") return undefined;
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
};
const whole = (text: string): number | undefined | null => {
  const cleaned = text.trim();
  if (cleaned === "") return undefined;
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
};

/**
 * The target fields one Planned set records, by its exercise type: weight, the rep range as two
 * steppers joined by "to", effort, duration, distance, floors, steps. `repsOnly` shows just the
 * reps (a warm-up). Every change goes out as a partial target.
 */
export function TargetFields({
  type,
  target,
  onChange,
  weightUnit,
  effortScale,
  repsOnly = false,
}: {
  type: ExerciseType;
  target: Target;
  onChange: (change: Partial<Target>) => void;
  weightUnit: WeightUnit;
  effortScale: EffortScale;
  repsOnly?: boolean;
}) {
  const { t } = useTranslation();
  const labels = useSummaryLabels();
  const fields = repsOnly ? SET_FIELDS[type].filter((field) => field === "reps") : SET_FIELDS[type];
  const unitName = t(weightUnit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const effort: EffortRange | null =
    target.effort_min !== undefined && target.effort_max !== undefined
      ? { min: target.effort_min, max: target.effort_max }
      : null;

  const stepReps = (end: "min" | "max", direction: 1 | -1) => {
    const min = target.reps_min;
    const max = target.reps_max;
    if (min === undefined || max === undefined) {
      onChange({ reps_min: DEFAULT_REPS, reps_max: DEFAULT_REPS });
      return;
    }
    if (end === "min") {
      const next = Math.min(MAX_REPS, Math.max(1, min + direction));
      onChange({ reps_min: next, reps_max: Math.max(max, next) });
    } else {
      const next = Math.min(MAX_REPS, Math.max(1, max + direction));
      onChange({ reps_max: next, reps_min: Math.min(min, next) });
    }
  };

  return (
    <View className="gap-4">
      {fields.map((field) => {
        if (field === "weight") {
          return (
            <NumberField
              key={field}
              label={t("training__field_weight", { unit: unitName })}
              value={target.weight_kg}
              decimal
              unit={unitName}
              parse={(text) => {
                const cleaned = text.trim();
                return cleaned === "" ? undefined : parseWeight(cleaned, weightUnit);
              }}
              format={(kg) => formatWeight(kg, weightUnit)}
              onValue={(weight_kg) => onChange({ weight_kg })}
            />
          );
        }
        if (field === "reps") {
          return (
            <View key={field} className="gap-4">
              <View className="gap-1.5">
                <Text className="text-label font-medium text-foreground">
                  {t("training__field_reps")}
                </Text>
                <View className="flex-row items-center gap-2">
                  <View className="flex-1">
                    <Stepper
                      label={t("training__reps_min")}
                      valueText={target.reps_min === undefined ? "–" : String(target.reps_min)}
                      onStep={(direction) => stepReps("min", direction)}
                      canDecrement={target.reps_min === undefined || target.reps_min > 1}
                      canIncrement={target.reps_min === undefined || target.reps_min < MAX_REPS}
                      decrementLabel={t("training__reps_min_less")}
                      incrementLabel={t("training__reps_min_more")}
                    />
                  </View>
                  <Text className="text-body text-muted">{t("training__reps_to")}</Text>
                  <View className="flex-1">
                    <Stepper
                      label={t("training__reps_max")}
                      valueText={target.reps_max === undefined ? "–" : String(target.reps_max)}
                      onStep={(direction) => stepReps("max", direction)}
                      canDecrement={target.reps_max === undefined || target.reps_max > 1}
                      canIncrement={target.reps_max === undefined || target.reps_max < MAX_REPS}
                      decrementLabel={t("training__reps_max_less")}
                      incrementLabel={t("training__reps_max_more")}
                    />
                  </View>
                </View>
              </View>
              {repsOnly ? null : (
                <View className="gap-1.5">
                  <Text className="text-label font-medium text-foreground">
                    {t("training__field_effort", {
                      scale: t(
                        effortScale === "rpe" ? "training__effort_rpe" : "training__effort_rir",
                      ),
                    })}
                  </Text>
                  <EffortSelector
                    value={effort}
                    scale={effortScale}
                    onChange={(range) =>
                      onChange({ effort_min: range?.min, effort_max: range?.max })
                    }
                  />
                </View>
              )}
            </View>
          );
        }
        if (field === "duration") {
          const seconds = target.duration_s;
          return (
            <View key={field} className="gap-1.5">
              <Text className="text-label font-medium text-foreground">
                {t("training__field_duration")}
              </Text>
              <Stepper
                label={t("training__field_duration")}
                valueText={seconds === undefined ? "–" : formatSeconds(seconds, labels)}
                onStep={(direction) =>
                  onChange({
                    duration_s: stepDuration(seconds ?? 30, seconds === undefined ? 1 : direction),
                  })
                }
                canDecrement={seconds === undefined || seconds > 5}
                canIncrement={seconds === undefined || seconds < MAX_DURATION_SECONDS}
                decrementLabel={t("training__duration_less")}
                incrementLabel={t("training__duration_more")}
              />
            </View>
          );
        }
        if (field === "distance") {
          return (
            <NumberField
              key={field}
              label={t("training__field_distance")}
              value={target.distance_m}
              decimal
              unit={t("training__unit_m")}
              parse={decimal}
              format={(meters) => String(Number(meters.toFixed(1)))}
              onValue={(distance_m) => onChange({ distance_m })}
            />
          );
        }
        if (field === "floors") {
          return (
            <NumberField
              key={field}
              label={t("training__field_floors")}
              value={target.floors}
              parse={whole}
              format={String}
              onValue={(floors) => onChange({ floors: floors === 0 ? undefined : floors })}
            />
          );
        }
        return (
          <NumberField
            key={field}
            label={t("training__field_steps")}
            value={target.steps}
            parse={whole}
            format={String}
            onValue={(steps) => onChange({ steps: steps === 0 ? undefined : steps })}
          />
        );
      })}
    </View>
  );
}
