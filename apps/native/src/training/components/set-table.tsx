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
import { ArrowsHorizontal } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";

import { formatEffortRange } from "../effort";
import { formatClock, parseDuration } from "../rest";
import type { Target } from "../set-editing";
import { CellInput } from "./cell-input";

const MAX_REPS = 999;
/** What "make it a range" adds on top of the single value. */
const RANGE_SPAN = 2;

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
const reps = (text: string): number | undefined | null => {
  const value = whole(text);
  return value === undefined || value === null ? value : value > MAX_REPS ? null : value;
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
 * type records. Reps is one input, or two ("8 – 12") when it is a range; the dash between them
 * turns a range back into one value, and the arrows beside a single value make it a range.
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
}: {
  type: ExerciseType;
  sets: readonly PlannedSet[];
  /** The text of each set's chip (W, 1…n, D, F). */
  chips: readonly string[];
  weightUnit: WeightUnit;
  effortScale: EffortScale;
  onChange: (index: number, change: Partial<Target>) => void;
  onKind: (index: number) => void;
  onEffort: (index: number) => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
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
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text className="w-11 text-center text-caption text-muted">{t("training__col_set")}</Text>
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
        const number = index + 1;
        const warmup = set.kind === "warmup";
        const cell = (column: SetField | "effort") => {
          if (warmup && column !== "reps") return <View key={column} className={grow(column)} />;
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
                <RepsCell
                  key={column}
                  set={set}
                  label={t("training__cell_label", { number, field: header(column) })}
                  minLabel={t("training__reps_min")}
                  maxLabel={t("training__reps_max")}
                  rangeLabel={t("training__reps_make_range", { number })}
                  singleLabel={t("training__reps_make_single", { number })}
                  iconColor={subtle}
                  onChange={(change) => onChange(index, change)}
                />
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
        return (
          <View key={index} className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("training__set_kind_change", {
                number,
                kind: t(SET_KIND_KEYS[set.kind]),
              })}
              onPress={() => {
                haptic.tick();
                onKind(index);
              }}
              hitSlop={4}
              className="h-10 w-11 items-center justify-center rounded-lg bg-default active:bg-border"
            >
              <Text className="font-semibold text-label text-foreground">{chips[index] ?? ""}</Text>
            </Pressable>
            {columns.map((column) => cell(column))}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Reps as one input, or "min – max" as two. A single value can become a range with the arrows
 * beside it (the maximum starts two above); the dash of a range makes it one value again. A range
 * whose ends would cross is not applied until it is valid, and the text goes back on blur.
 */
function RepsCell({
  set,
  label,
  minLabel,
  maxLabel,
  rangeLabel,
  singleLabel,
  iconColor,
  onChange,
}: {
  set: PlannedSet;
  label: string;
  minLabel: string;
  maxLabel: string;
  rangeLabel: string;
  singleLabel: string;
  iconColor: string | undefined;
  onChange: (change: Partial<Target>) => void;
}) {
  const min = set.reps_min;
  const max = set.reps_max;
  // Once a range is chosen it stays two inputs while typing, even when the ends meet.
  const [chosen, setChosen] = useState(false);
  const isRange = min !== undefined && max !== undefined && (chosen || min !== max);

  if (!isRange) {
    return (
      <View className="flex-[1.7] flex-row items-center gap-1">
        <CellInput
          label={label}
          value={min}
          parse={reps}
          format={String}
          onValue={(value) => onChange({ reps_min: value, reps_max: value })}
        />
        {min !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={rangeLabel}
            onPress={() => {
              haptic.tick();
              setChosen(true);
              onChange({ reps_min: min, reps_max: Math.min(MAX_REPS, min + RANGE_SPAN) });
            }}
            hitSlop={6}
            className="h-10 w-7 items-center justify-center"
          >
            <ArrowsHorizontal size={16} color={iconColor} />
          </Pressable>
        ) : null}
      </View>
    );
  }
  return (
    <View className="flex-[1.7] flex-row items-center">
      <CellInput
        label={minLabel}
        value={min}
        parse={(text) => {
          const value = reps(text);
          return value === undefined || (value !== null && value > max) ? null : value;
        }}
        format={String}
        onValue={(value) => onChange({ reps_min: value, reps_max: max })}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={singleLabel}
        onPress={() => {
          haptic.tick();
          setChosen(false);
          onChange({ reps_min: min, reps_max: min });
        }}
        hitSlop={6}
        className="h-10 w-5 items-center justify-center"
      >
        <Text className="text-body text-muted">–</Text>
      </Pressable>
      <CellInput
        label={maxLabel}
        value={max}
        parse={(text) => {
          const value = reps(text);
          return value === undefined || (value !== null && value < min) ? null : value;
        }}
        format={String}
        onValue={(value) => onChange({ reps_min: min, reps_max: value })}
      />
    </View>
  );
}
