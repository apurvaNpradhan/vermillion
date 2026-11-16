import { getLocales } from "expo-localization";
import { useState } from "react";
import { Text, View } from "react-native";

import { FlowStep, stepPosition } from "@/auth";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { usePreferences } from "@/preferences";

import { defaultUnits, type Units } from "../default-units";

/**
 * Kilograms or pounds, centimetres or inches, already set to what the phone's region uses, so
 * most people only confirm. A save that fails (offline) may be skipped: the app's defaults apply
 * and Settings can change them later.
 */
export function UnitsStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { setUiAsync } = usePreferences();
  const [units, setUnits] = useState<Units>(() => defaultUnits(getLocales()[0] ?? {}));
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    setPending(true);
    setFailed(false);
    try {
      await setUiAsync(units);
      haptic.confirm();
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <FlowStep
      leading="none"
      position={stepPosition("get-started", "units")}
      title={t("onboarding__units_title")}
      subtitle={t("onboarding__units_body")}
      action={{ label: t("onboarding__continue"), onPress: () => void save(), loading: pending }}
      secondary={failed ? { label: t("onboarding__skip"), onPress: onDone } : undefined}
    >
      <FormError message={failed ? t("onboarding__prefs_failed") : null} />
      <View className="gap-2">
        <Text className="text-label font-medium text-muted">{t("onboarding__units_weight")}</Text>
        <SegmentedControl
          accessibilityLabel={t("onboarding__units_weight")}
          value={units.weightUnit}
          onChange={(weightUnit) => setUnits({ ...units, weightUnit })}
          options={[
            { value: "kg", label: t("onboarding__units_kg") },
            { value: "lb", label: t("onboarding__units_lb") },
          ]}
        />
      </View>
      <View className="gap-2 pt-3">
        <Text className="text-label font-medium text-muted">{t("onboarding__units_length")}</Text>
        <SegmentedControl
          accessibilityLabel={t("onboarding__units_length")}
          value={units.lengthUnit}
          onChange={(lengthUnit) => setUnits({ ...units, lengthUnit })}
          options={[
            { value: "cm", label: t("onboarding__units_cm") },
            { value: "in", label: t("onboarding__units_in") },
          ]}
        />
      </View>
    </FlowStep>
  );
}
