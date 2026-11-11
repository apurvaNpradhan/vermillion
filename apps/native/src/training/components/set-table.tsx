import {
  SET_FIELDS,
  SET_KIND_KEYS,
  formatWeight,
  parseWeight,
  type EffortScale,
  type ExerciseType,
  type PlannedSet,
  type SetField,
  type WeightUnit,
} from "@workspace/shared";
import { Trash } from "phosphor-react-native";
import { Keyboard, Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { SwipeGroup, SwipeRow, type SwipeA11yProps } from "@/platform/ui/swipe-row";

import { formatEffortRange } from "../effort";
import { formatClock, parseDuration } from "../rest";
import type { Target } from "../set-editing";
import { SET_TONES } from "../set-tones";
import { RepTarget } from "./rep-target";
import { CellInput } from "./cell-input";

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
const meters = (value: number) => String(Number(value.toFixed(1)));

/** The set table's columns for an exercise type; effort rides along with reps. */
export function setColumns(type: ExerciseType): readonly (SetField | "effort")[] {
  return SET_FIELDS[type].flatMap((field) =>
    field === "reps" ? [field, "effort" as const] : [field],
  );
}

/**
 * The sets of one exercise as a compact table: Set (its kind chip), then the columns the exercise
 * type records. Rep targets open a labelled Exact reps / Rep range picker.
 * Warm-ups only record reps. Every edit goes out as a partial target for one set.
 */
export function SetTable({
  type,
  sets,
  chips,
  weightUnit,
  effortScale,
  onChange,
  onKind,
  onEffort,
  onRemove,
}: {
  onRemove?: (index: number) => void;
  type: ExerciseType;
  sets: readonly PlannedSet[];
  /** The text of each set's chip (W, 1…n, D, F, T, B, M). */
  chips: readonly string[];
  weightUnit: WeightUnit;
  effortScale: EffortScale;
  onChange: (index: number, change: Partial<Target>) => void;
  onKind: (index: number) => void;
  onEffort: (index: number) => void;
}) {
  const { t } = useTranslation();
  const columns = setColumns(type);
  const unitName = t(weightUnit === "kg" ? "training__unit_kg" : "training__unit_lb");

  const header = (column: SetField | "effort"): string => {
    switch (column) {
      case "weight":
        return t("training__field_weight", { unit: unitName });
      case "reps":
        return t("training__field_reps");
      case "effort":
        return t(effortScale === "rpe" ? "training__effort_rpe" : "training__effort_rir");
      case "duration":
        return t("training__field_duration");
      case "distance":
        return t("training__col_distance", { unit: t("training__unit_m") });
      case "floors":
        return t("training__field_floors");
      case "steps":
        return t("training__field_steps");
    }
  };
  const grow = (column: SetField | "effort") => (column === "reps" ? "flex-[1.7]" : "flex-1");

  return (
    <SwipeGroup>
      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <Text className="w-12 text-center text-caption text-muted">{t("training__col_set")}</Text>
          {columns.map((column) => (
            <Text
              key={column}
              numberOfLines={1}
              className={`${grow(column)} text-center text-caption text-muted`}
            >
              {header(column)}
            </Text>
          ))}
        </View>
        {sets.map((set, index) => {
          const number = chips[index] ?? index + 1;
          const warmup = set.kind === "warmup";
          const cell = (column: SetField | "effort") => {
            if (warmup && column === "effort")
              return <View key={column} className={grow(column)} />;
            switch (column) {
              case "weight":
                return (
                  <CellInput
                    key={column}
                    label={t("training__cell_label", { number, field: header(column) })}
                    value={set.weight_kg}
                    decimal
                    parse={(text) => {
                      const cleaned = text.trim();
                      return cleaned === "" ? undefined : parseWeight(cleaned, weightUnit);
                    }}
                    format={(kg) => formatWeight(kg, weightUnit)}
                    onValue={(weight_kg) => onChange(index, { weight_kg })}
                  />
                );
              case "reps":
                return (
                  <View key={column} className={grow(column)}>
                    <RepTarget
                      set={set}
                      label={t("training__cell_label", { number, field: header(column) })}
                      onChange={(change) => onChange(index, change)}
                    />
                  </View>
                );
              case "effort": {
                const value =
                  set.effort_min !== undefined && set.effort_max !== undefined
                    ? formatEffortRange(set.effort_min, set.effort_max, effortScale)
                    : null;
                return (
                  <Pressable
                    key={column}
                    accessibilityRole="button"
                    accessibilityLabel={t("training__effort_cell_label", {
                      number,
                      value: value ?? t("training__effort_none"),
                    })}
                    onPress={() => {
                      Keyboard.dismiss();
                      haptic.tick();
                      onEffort(index);
                    }}
                    className="h-10 flex-1 items-center justify-center rounded-lg bg-field active:bg-default"
                  >
                    <Text
                      className={`text-body ${value === null ? "text-muted" : "text-foreground"}`}
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {value ?? "–"}
                    </Text>
                  </Pressable>
                );
              }
              case "duration":
                return (
                  <CellInput
                    key={column}
                    label={t("training__cell_label", { number, field: header(column) })}
                    value={set.duration_s}
                    placeholder="0:00"
                    parse={parseDuration}
                    format={formatClock}
                    onValue={(duration_s) => onChange(index, { duration_s })}
                  />
                );
              case "distance":
                return (
                  <CellInput
                    key={column}
                    label={t("training__cell_label", { number, field: header(column) })}
                    value={set.distance_m}
                    decimal
                    parse={decimal}
                    format={meters}
                    onValue={(distance_m) => onChange(index, { distance_m })}
                  />
                );
              case "floors":
                return (
                  <CellInput
                    key={column}
                    label={t("training__cell_label", { number, field: header(column) })}
                    value={set.floors}
                    parse={whole}
                    format={String}
                    onValue={(floors) =>
                      onChange(index, { floors: floors === 0 ? undefined : floors })
                    }
                  />
                );
              case "steps":
                return (
                  <CellInput
                    key={column}
                    label={t("training__cell_label", { number, field: header(column) })}
                    value={set.steps}
                    parse={whole}
                    format={String}
                    onValue={(steps) => onChange(index, { steps: steps === 0 ? undefined : steps })}
                  />
                );
            }
          };
          const row = (a11y?: SwipeA11yProps) => (
            <View className="flex-row items-center gap-2">
              <Pressable
                {...a11y}
                accessibilityRole="button"
                accessibilityLabel={t("training__set_kind_change", {
                  number,
                  kind: t(SET_KIND_KEYS[set.kind]),
                })}
                onPress={() => {
                  Keyboard.dismiss();
                  haptic.tick();
                  onKind(index);
                }}
                hitSlop={4}
                className={`min-h-11 w-12 flex-row items-center justify-center gap-1 rounded-lg ${SET_TONES[set.kind].background}`}
              >
                <Text className={`font-semibold text-label ${SET_TONES[set.kind].text}`}>
                  {chips[index] ?? ""}
                </Text>
              </Pressable>
              {columns.map((column) => cell(column))}
            </View>
          );
          return onRemove && sets.length > 1 ? (
            <SwipeRow
              key={index}
              actions={[
                {
                  key: "remove",
                  label: t("training__remove"),
                  icon: Trash,
                  tone: "danger",
                  iconOnly: true,
                  onPress: () => onRemove(index),
                },
              ]}
            >
              {(a11y) => row(a11y)}
            </SwipeRow>
          ) : (
            <View key={index}>{row()}</View>
          );
        })}
      </View>
    </SwipeGroup>
  );
}
