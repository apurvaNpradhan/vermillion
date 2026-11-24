import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { WEEK_STARTS, WEEK_START_KEYS, type WeekStart } from "@workspace/shared";

import { FlowStep, stepPosition } from "@/auth";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { usePreferences } from "@/preferences";

import { prefsFailureOf, type PrefsFailure } from "../prefs-failure";

const TRAINING_DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7];

/**
 * Days per week (the weekly session goal Home and History count against when no Program sets
 * one) and the first day of the week. Either answer can be saved on its own.
 */
export function DaysStep({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const numbers = new Intl.NumberFormat(i18n.language);
  const { preferences, setUiAsync } = usePreferences();
  const [days, setDays] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState<WeekStart | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<PrefsFailure | null>(null);

  const changedWeekStart = weekStart !== null && weekStart !== preferences.ui.weekStart;
  const canSave = days !== null || changedWeekStart;
  const save = async () => {
    if (!canSave) return;
    setPending(true);
    setFailure(null);
    try {
      await setUiAsync({
        ...(days === null ? {} : { sessionsPerWeek: days }),
        ...(changedWeekStart ? { weekStart } : {}),
      });
      haptic.confirm();
      onDone();
    } catch (error) {
      setFailure(error instanceof Error ? prefsFailureOf(error) : "onboarding__prefs_failed");
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
      action={{
        label: t("onboarding__continue"),
        onPress: () => void save(),
        disabled: !canSave,
        loading: pending,
      }}
      secondary={{ label: t("onboarding__skip"), onPress: onDone, disabled: pending }}
    >
      <FormError message={failure ? t(failure) : null} />
      <View className="gap-2">
        <Text className="text-label font-medium text-muted">{t("onboarding__days_label")}</Text>
        <View
          className="flex-row flex-wrap gap-2"
          accessibilityRole="radiogroup"
          accessibilityLabel={t("onboarding__days_label")}
        >
          {TRAINING_DAY_CHOICES.map((count) => (
            <Pressable
              key={count}
              accessibilityRole="radio"
              accessibilityState={{ checked: days === count }}
              accessibilityLabel={t("onboarding__days_option", {
                count,
                days: numbers.format(count),
              })}
              onPress={() => {
                if (days === count) return;
                haptic.tick();
                setDays(count);
              }}
              className={`min-h-12 min-w-12 items-center justify-center rounded-xl px-3 active:opacity-70 ${
                days === count ? "bg-default" : "bg-surface"
              }`}
            >
              <Text className="font-medium tabular-nums text-foreground">
                {numbers.format(count)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View className="gap-2 pt-3">
        <Text className="text-label font-medium text-muted">
          {t("training__setting_week_start")}
        </Text>
        <SegmentedControl
          accessibilityLabel={t("training__setting_week_start")}
          value={weekStart ?? preferences.ui.weekStart}
          onChange={setWeekStart}
          options={WEEK_STARTS.map((value) => ({ value, label: t(WEEK_START_KEYS[value]) }))}
        />
      </View>
    </FlowStep>
  );
}
