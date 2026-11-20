import { useRouter } from "expo-router";
import {
  EFFORT_SCALES,
  KG_PER_LB,
  EFFORT_SCALE_NAME_KEYS,
  TRAINING_LIMITS,
  WEEK_STARTS,
  WEEK_START_KEYS,
  WEIGHT_UNITS,
  WEIGHT_UNIT_KEYS,
  type EffortScale,
  type WeekStart,
  type WeightUnit,
} from "@workspace/shared";
import { Barbell, CalendarBlank, Gauge, Target, Timer } from "phosphor-react-native";
import { useState, type ReactNode } from "react";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { usePreferences } from "@/preferences";

import { formatClock } from "@/training/targets/rest";

type Picker = "unit" | "effort" | "rest" | "increment" | "weekStart" | "sessions" | null;

/** Default rest choices, in seconds. */
const REST_CHOICES = [30, 45, 60, 90, 120, 150, 180, 240, 300] as const;

/**
 * Weight unit, effort scale and default rest as settings rows, each opening a short sheet, then
 * the rows other verticals add through `extraRows`, then Manage equipment. The section and its
 * sheets come apart so a caller can draw the section inside another sheet's portal (which has no
 * query client) while the preferences are read here and the pickers open as their own sheets.
 */

/** Weekly session goals to offer; a stored value outside the list is added. */
const SESSION_CHOICES = [1, 2, 3, 4, 5, 6, 7] as const;

/** Weight increments to offer, in the unit the user weighs in. */
const INCREMENT_CHOICES = {
  kg: [1, 1.25, 2, 2.5, 5],
  lb: [1, 2.5, 5, 10],
} as const satisfies Record<WeightUnit, readonly number[]>;

export function useTrainingPreferenceRows({
  extraRows = [],
  onManageEquipment,
}: {
  extraRows?: ReactNode[];
  /** Opens the bars and plates; Settings' own screen by default. */
  onManageEquipment?: () => void;
} = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { preferences, setUi } = usePreferences();
  const { weightUnit, effortScale, defaultRestSeconds, weekStart, sessionsPerWeek } =
    preferences.ui;
  const sessionChoices: readonly number[] =
    sessionsPerWeek === null || SESSION_CHOICES.some((count) => count === sessionsPerWeek)
      ? SESSION_CHOICES
      : [...SESSION_CHOICES, sessionsPerWeek].sort((a, b) => a - b);
  const [picker, setPicker] = useState<Picker>(null);
  const onOpenChange = (open: boolean) => {
    if (!open) setPicker(null);
  };
  const restChoices = REST_CHOICES.some((seconds) => seconds === defaultRestSeconds)
    ? REST_CHOICES
    : [...REST_CHOICES, defaultRestSeconds].sort((a, b) => a - b);

  const toKg = (amount: number) =>
    weightUnit === "lb" ? Number((amount * KG_PER_LB).toFixed(6)) : amount;
  const fromKg = (kg: number) =>
    weightUnit === "lb" ? Number((kg / KG_PER_LB).toFixed(2)) : Number(kg.toFixed(2));
  const incrementLabel = (kg: number) =>
    t("progress__increment_value", {
      value: new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
        weightUnit === "lb" ? kg / KG_PER_LB : kg,
      ),
      unit: weightUnit,
    });
  const rows = {
    unit: (
      <ListRow
        key="unit"
        icon={Barbell}
        title={t("training__setting_unit")}
        value={t(WEIGHT_UNIT_KEYS[weightUnit])}
        onPress={() => setPicker("unit")}
      />
    ),
    effort: (
      <ListRow
        key="effort"
        icon={Gauge}
        title={t("training__setting_effort")}
        value={t(EFFORT_SCALE_NAME_KEYS[effortScale])}
        onPress={() => setPicker("effort")}
      />
    ),
    rest: (
      <ListRow
        key="rest"
        icon={Timer}
        title={t("training__setting_rest")}
        value={formatClock(defaultRestSeconds)}
        onPress={() => setPicker("rest")}
      />
    ),
    increment: (
      <ListRow
        key="increment"
        icon={Barbell}
        title={t("progress__increment")}
        value={
          preferences.ui.weightIncrementKg === null
            ? t("progress__auto")
            : incrementLabel(preferences.ui.weightIncrementKg)
        }
        onPress={() => setPicker("increment")}
      />
    ),
    weekStart: (
      <ListRow
        key="weekStart"
        icon={CalendarBlank}
        title={t("training__setting_week_start")}
        value={t(WEEK_START_KEYS[weekStart])}
        onPress={() => setPicker("weekStart")}
      />
    ),
    sessions: (
      <ListRow
        key="sessions"
        icon={Target}
        title={t("training__setting_sessions")}
        value={
          sessionsPerWeek === null
            ? t("training__setting_sessions_none")
            : t("stats__sessions", { count: sessionsPerWeek })
        }
        onPress={() => setPicker("sessions")}
      />
    ),
    equipment: (
      <ListRow
        key="equipment"
        icon={Barbell}
        title={t("plates__manage")}
        onPress={onManageEquipment ?? (() => router.push("/settings/plates"))}
      />
    ),
  };
  const section = (
    <ListSection title={t("training__settings_title")}>
      {rows.unit}
      {rows.effort}
      {rows.rest}
      {rows.increment}
      {rows.weekStart}
      {rows.sessions}
      {extraRows}
      {rows.equipment}
    </ListSection>
  );
  const sheets = (
    <>
      <OptionSheet
        isOpen={picker === "increment"}
        onOpenChange={onOpenChange}
        title={t("progress__increment")}
        options={[
          { value: "auto", label: t("progress__auto") },
          // Choices are in the user's unit and stored in kilograms.
          ...INCREMENT_CHOICES[weightUnit].map((amount) => ({
            value: String(amount),
            label: incrementLabel(toKg(amount)),
          })),
        ]}
        value={
          preferences.ui.weightIncrementKg === null
            ? "auto"
            : String(fromKg(preferences.ui.weightIncrementKg))
        }
        onSelect={(value) =>
          setUi({ weightIncrementKg: value === "auto" ? null : toKg(Number(value)) })
        }
      />
      <OptionSheet<WeightUnit>
        isOpen={picker === "unit"}
        onOpenChange={onOpenChange}
        title={t("training__setting_unit")}
        description={t("training__setting_unit_hint")}
        options={WEIGHT_UNITS.map((value) => ({ value, label: t(WEIGHT_UNIT_KEYS[value]) }))}
        value={weightUnit}
        onSelect={(value) => setUi({ weightUnit: value })}
      />
      <OptionSheet<EffortScale>
        isOpen={picker === "effort"}
        onOpenChange={onOpenChange}
        title={t("training__setting_effort")}
        description={t("training__setting_effort_hint")}
        options={EFFORT_SCALES.map((value) => ({ value, label: t(EFFORT_SCALE_NAME_KEYS[value]) }))}
        value={effortScale}
        onSelect={(value) => setUi({ effortScale: value })}
      />
      <OptionSheet<WeekStart>
        isOpen={picker === "weekStart"}
        onOpenChange={onOpenChange}
        title={t("training__setting_week_start")}
        description={t("training__setting_week_start_hint")}
        options={WEEK_STARTS.map((value) => ({ value, label: t(WEEK_START_KEYS[value]) }))}
        value={weekStart}
        onSelect={(value) => setUi({ weekStart: value })}
      />
      <OptionSheet
        isOpen={picker === "sessions"}
        onOpenChange={onOpenChange}
        title={t("training__setting_sessions")}
        description={t("training__setting_sessions_hint")}
        options={[
          { value: "none", label: t("training__setting_sessions_none") },
          ...sessionChoices.flatMap((count) =>
            count <= TRAINING_LIMITS.sessionsPerWeekMax
              ? [{ value: String(count), label: t("stats__sessions", { count }) }]
              : [],
          ),
        ]}
        value={sessionsPerWeek === null ? "none" : String(sessionsPerWeek)}
        onSelect={(value) => setUi({ sessionsPerWeek: value === "none" ? null : Number(value) })}
      />
      <OptionSheet
        isOpen={picker === "rest"}
        onOpenChange={onOpenChange}
        title={t("training__setting_rest")}
        description={t("training__setting_rest_hint")}
        options={restChoices.map((seconds) => ({
          value: String(seconds),
          label: formatClock(seconds),
        }))}
        value={String(defaultRestSeconds)}
        onSelect={(value) => setUi({ defaultRestSeconds: Number(value) })}
      />
    </>
  );
  return { section, sheets, rows };
}
