import { useRouter } from "expo-router";
import {
  EFFORT_SCALES,
  KG_PER_LB,
  EFFORT_SCALE_NAME_KEYS,
  WEIGHT_UNITS,
  WEIGHT_UNIT_KEYS,
  type EffortScale,
  type WeightUnit,
} from "@workspace/shared";
import { Barbell, Gauge, Timer } from "phosphor-react-native";
import { useState, type ReactNode } from "react";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { usePreferences } from "@/preferences";

import { formatClock } from "../rest";

type Picker = "unit" | "effort" | "rest" | "increment" | null;

/** Default rest choices, in seconds. */
const REST_CHOICES = [30, 45, 60, 90, 120, 150, 180, 240, 300] as const;

/**
 * Weight unit, effort scale and default rest as settings rows, each opening a short sheet, then
 * the rows other verticals add through `extraRows`, then Manage equipment. The section and its
 * sheets come apart so a caller can draw the section inside another sheet's portal (which has no
 * query client) while the preferences are read here and the pickers open as their own sheets.
 */

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
  const { weightUnit, effortScale, defaultRestSeconds } = preferences.ui;
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
  const section = (
    <ListSection title={t("training__settings_title")}>
      <ListRow
        icon={Barbell}
        title={t("training__setting_unit")}
        value={t(WEIGHT_UNIT_KEYS[weightUnit])}
        onPress={() => setPicker("unit")}
      />
      <ListRow
        icon={Gauge}
        title={t("training__setting_effort")}
        value={t(EFFORT_SCALE_NAME_KEYS[effortScale])}
        onPress={() => setPicker("effort")}
      />
      <ListRow
        icon={Timer}
        title={t("training__setting_rest")}
        value={formatClock(defaultRestSeconds)}
        onPress={() => setPicker("rest")}
      />
      <ListRow
        icon={Barbell}
        title={t("progress__increment")}
        value={
          preferences.ui.weightIncrementKg === null
            ? t("progress__auto")
            : incrementLabel(preferences.ui.weightIncrementKg)
        }
        onPress={() => setPicker("increment")}
      />
      {extraRows}
      <ListRow
        icon={Barbell}
        title={t("plates__manage")}
        onPress={onManageEquipment ?? (() => router.push("/settings/plates"))}
      />
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
  return { section, sheets };
}
