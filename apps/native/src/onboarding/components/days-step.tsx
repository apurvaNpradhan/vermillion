import { useState } from "react";
import { Text, View } from "react-native";

import { WEEK_STARTS, WEEK_START_KEYS, type WeekStart } from "@workspace/shared";

import { FlowStep, stepPosition } from "@/auth";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { usePreferences } from "@/preferences";

import { TRAINING_DAY_CHOICES } from "../training-profile";

/**
 * Days per week (the weekly session goal Home and History count against when no Program sets
 * one) and the first day of the week. Skipping leaves the goal unset and the week on Monday.
 */
export function DaysStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { preferences, setUiAsync } = usePreferences();
  const [days, setDays] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState<WeekStart>(preferences.ui.weekStart);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    if (days === null && weekStart === preferences.ui.weekStart) return onDone();
    setPending(true);
    setFailed(false);
    try {
      await setUiAsync({ ...(days === null ? {} : { sessionsPerWeek: days }), weekStart });
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
      position={stepPosition("get-started", "days")}
      title={t("onboarding__days_title")}
      subtitle={t("onboarding__days_body")}
      action={{ label: t("onboarding__continue"), onPress: () => void save(), loading: pending }}
      secondary={{ label: t("onboarding__skip"), onPress: onDone, disabled: pending }}
    >
      <FormError message={failed ? t("onboarding__prefs_failed") : null} />
      <View className="gap-2">
        <Text className="text-label font-medium text-muted">{t("onboarding__days_label")}</Text>
        <SegmentedControl
          accessibilityLabel={t("onboarding__days_label")}
          value={days === null ? null : String(days)}
          onChange={(value) => setDays(Number(value))}
          options={TRAINING_DAY_CHOICES.map((count) => ({
            value: String(count),
            label: String(count),
          }))}
        />
      </View>
      <View className="gap-2 pt-3">
        <Text className="text-label font-medium text-muted">
          {t("training__setting_week_start")}
        </Text>
        <SegmentedControl
          accessibilityLabel={t("training__setting_week_start")}
          value={weekStart}
          onChange={setWeekStart}
          options={WEEK_STARTS.map((value) => ({ value, label: t(WEEK_START_KEYS[value]) }))}
        />
      </View>
    </FlowStep>
  );
}
