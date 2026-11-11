import { useRouter } from "expo-router";
import {
  EFFORT_SCALES,
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

type Picker = "unit" | "effort" | "rest" | null;

/** Default rest choices, in seconds. */
const REST_CHOICES = [30, 45, 60, 90, 120, 150, 180, 240, 300] as const;

/**
 * Weight unit, effort scale and default rest as settings rows, each opening a short sheet, then
 * the rows other verticals add through `extraRows`, then Manage equipment.
 */
export function TrainingPreferenceRows({
  extraRows = [],
  onManageEquipment,
}: {
  extraRows?: ReactNode[];
  /** Opens the bars and plates; Settings' own screen by default. */
  onManageEquipment?: () => void;
}) {
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

  return (
    <>
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
        {extraRows}
        <ListRow
          icon={Barbell}
          title={t("plates__manage")}
          onPress={onManageEquipment ?? (() => router.push("/settings/plates"))}
        />
      </ListSection>
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
}
