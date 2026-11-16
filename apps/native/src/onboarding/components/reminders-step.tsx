import { Switch, useThemeColor } from "heroui-native";
import { Bell, Scales, Timer, type IconProps } from "phosphor-react-native";
import { useState, type ComponentType } from "react";
import { Text, View } from "react-native";

import { FlowStep, stepPosition } from "@/auth";
import type { TranslationKey } from "@workspace/i18n";
import { useTranslation } from "@/platform/i18n";
import { usePreferences } from "@/preferences";
import { getNotificationPermission } from "@/platform/notifications/permission";
import { askNotificationPermission } from "@/platform/notifications/permission-store";

const BENEFITS: { icon: ComponentType<IconProps>; title: TranslationKey; body: TranslationKey }[] =
  [
    { icon: Timer, title: "onboarding__notify_rest", body: "onboarding__notify_rest_body" },
    { icon: Scales, title: "onboarding__notify_weigh", body: "onboarding__notify_weigh_body" },
    { icon: Bell, title: "onboarding__notify_check", body: "onboarding__notify_check_body" },
  ];

/**
 * Asks for notifications with the reasons first, so the system dialog is not a surprise later in
 * the middle of a set. The daily weigh-in reminder is an explicit choice and off by default.
 * Whatever the answer, onboarding ends here.
 */
export function RemindersStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { preferences, setUiAsync } = usePreferences();
  const foreground = useThemeColor("foreground");
  const [remind, setRemind] = useState(false);
  const [pending, setPending] = useState(false);

  const allow = async () => {
    setPending(true);
    try {
      await askNotificationPermission();
      if (remind && (await getNotificationPermission()) === "granted") {
        // Best effort: offline, the reminder can still be turned on in Settings.
        await setUiAsync({
          weighInReminder: { ...preferences.ui.weighInReminder, enabled: true },
        }).catch(() => undefined);
      }
    } finally {
      setPending(false);
      onDone();
    }
  };

  return (
    <FlowStep
      leading="none"
      position={stepPosition("get-started", "reminders")}
      title={t("onboarding__notify_title")}
      subtitle={t("onboarding__notify_body")}
      action={{
        label: t("onboarding__notify_action"),
        onPress: () => void allow(),
        loading: pending,
      }}
      secondary={{ label: t("onboarding__not_now"), onPress: onDone, disabled: pending }}
    >
      {BENEFITS.map(({ icon: Icon, title, body }) => (
        <View key={title} className="flex-row items-start gap-3 py-1">
          <Icon size={24} color={foreground} />
          <View className="flex-1 gap-0.5">
            <Text className="text-body font-semibold text-foreground">{t(title)}</Text>
            <Text className="text-body text-muted">{t(body)}</Text>
          </View>
        </View>
      ))}
      <View className="mt-3 flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-body font-medium text-foreground">
            {t("onboarding__notify_daily")}
          </Text>
          <Text className="text-caption text-muted">
            {t("onboarding__notify_daily_hint", { time: preferences.ui.weighInReminder.time })}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t("onboarding__notify_daily")}
          isSelected={remind}
          onSelectedChange={setRemind}
        >
          <Switch.Thumb />
        </Switch>
      </View>
    </FlowStep>
  );
}
