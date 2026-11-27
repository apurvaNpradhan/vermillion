import { Switch, useThemeColor } from "heroui-native";
import { Bell, BellSlash, ChartLineUp, Minus, Plus } from "phosphor-react-native";
import { Linking, Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import {
  askNotificationPermission,
  useNotificationPermission,
} from "@/platform/notifications/permission-store";
import { ListRow } from "@/platform/ui/list";
import { usePreferences } from "@/preferences";

import { trainingWeekdays } from "./reminder-plan";

/** Monday first; Expo weekdays (Sunday is 1). */
const WEEK_ORDER = [2, 3, 4, 5, 6, 7, 1] as const;

function formatTime(time: string, locale: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
    new Date(2026, 10, 15, hour, minute),
  );
}

function TimeStepper({ time, onChange }: { time: string; onChange: (time: string) => void }) {
  const { t } = useTranslation();
  const foreground = useThemeColor("foreground");
  const [hour = "18", minute = "00"] = time.split(":");
  const columns = [
    { part: "hour", count: 24, step: 1, value: hour, label: t("body__reminder_hour") },
    { part: "minute", count: 60, step: 5, value: minute, label: t("body__reminder_minute") },
  ] as const;
  return (
    <View className="flex-row gap-4">
      {columns.map((column) => {
        const move = (direction: 1 | -1) => {
          const next =
            (Number(column.value) + direction * column.step + column.count) % column.count;
          const text = String(next).padStart(2, "0");
          onChange(column.part === "hour" ? `${text}:${minute}` : `${hour}:${text}`);
        };
        return (
          <View key={column.part} className="flex-1 gap-2">
            <Text className="font-normal text-caption text-muted">{column.label}</Text>
            <View className="flex-row items-center justify-between rounded-xl bg-default">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("session__key_decrease", { step: column.step })}
                onPress={() => move(-1)}
                className="h-12 w-12 items-center justify-center"
              >
                <Minus size={20} color={foreground} />
              </Pressable>
              <Text
                accessibilityLabel={t("body__reminder_time_option", {
                  part: column.label,
                  value: column.value,
                })}
                className="font-medium text-numeric-md tabular-nums text-foreground"
              >
                {column.value}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("session__key_increase", { step: column.step })}
                onPress={() => move(1)}
                className="h-12 w-12 items-center justify-center"
              >
                <Plus size={20} color={foreground} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The Training reminder and the report notification as rows, plus a row that says when the system
 * has notifications off. Turning one on asks for the system permission first. The training rows go
 * in the Training group, the report row in the Records group.
 */
export function useReminderRows() {
  const { t, i18n } = useTranslation();
  const { preferences, setUi } = usePreferences();
  const permission = useNotificationPermission();
  const { trainingReminder, reportReminder, sessionsPerWeek, weighInReminder, checkInReminder } =
    preferences.ui;
  const days = trainingWeekdays(trainingReminder, sessionsPerWeek);

  const blocked =
    permission === "denied" ||
    (permission === "undetermined" &&
      (trainingReminder.enabled ||
        reportReminder.enabled ||
        weighInReminder.enabled ||
        checkInReminder.enabled));
  const disabled = permission === "denied" || permission === "unknown";
  const trainingOn = trainingReminder.enabled && permission === "granted";
  const reportOn = reportReminder.enabled && permission === "granted";
  const toggle = async (on: boolean, apply: (on: boolean) => void) => {
    if (!on) return apply(false);
    if (permission === "granted") return apply(true);
    if (permission === "undetermined" && (await askNotificationPermission()) === "granted")
      apply(true);
  };

  const weekdayLabel = (weekday: number) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 10, 14 + weekday)),
    );
  const setTraining = (patch: Partial<typeof trainingReminder>) =>
    setUi({ trainingReminder: { ...trainingReminder, ...patch } });

  const training = (
    <>
      <ListRow
        icon={Bell}
        title={t("reminder__training_row")}
        description={t("reminder__training_hint")}
        accessory="none"
        checked={trainingOn}
        disabled={disabled}
        value={blocked && trainingReminder.enabled ? t("session__setting_denied") : undefined}
        onPress={() => void toggle(!trainingOn, (on) => setTraining({ enabled: on }))}
        trailing={
          <Switch
            accessibilityLabel={t("reminder__training_row")}
            isSelected={trainingOn}
            isDisabled={disabled}
            onSelectedChange={(on) => void toggle(on, (value) => setTraining({ enabled: value }))}
          />
        }
      />
      {trainingReminder.enabled ? (
        <View className="gap-4 px-4 py-3">
          <View className="gap-2">
            <Text className="font-normal text-caption text-muted">{t("reminder__days")}</Text>
            <View className="flex-row flex-wrap gap-2">
              {WEEK_ORDER.map((weekday) => {
                const selected = days.includes(weekday);
                return (
                  <Pressable
                    key={weekday}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={weekdayLabel(weekday)}
                    onPress={() =>
                      setTraining({
                        weekdays: selected
                          ? days.filter((day) => day !== weekday)
                          : [...days, weekday],
                      })
                    }
                    className={
                      selected
                        ? "min-w-12 items-center rounded-full bg-accent px-3 py-2"
                        : "min-w-12 items-center rounded-full bg-default px-3 py-2"
                    }
                  >
                    <Text
                      className={
                        selected
                          ? "font-medium text-caption text-accent-foreground"
                          : "font-normal text-caption text-foreground"
                      }
                    >
                      {weekdayLabel(weekday)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <TimeStepper time={trainingReminder.time} onChange={(time) => setTraining({ time })} />
          <Text className="font-normal text-caption text-muted">
            {t("reminder__training_at", { time: formatTime(trainingReminder.time, i18n.language) })}
          </Text>
        </View>
      ) : null}
    </>
  );

  const records = (
    <ListRow
      icon={ChartLineUp}
      title={t("reminder__report_row")}
      description={t("reminder__report_hint", {
        time: formatTime(trainingReminder.time, i18n.language),
      })}
      accessory="none"
      checked={reportOn}
      disabled={disabled}
      value={blocked && reportReminder.enabled ? t("session__setting_denied") : undefined}
      onPress={() => void toggle(!reportOn, (on) => setUi({ reportReminder: { enabled: on } }))}
      trailing={
        <Switch
          accessibilityLabel={t("reminder__report_row")}
          isSelected={reportOn}
          isDisabled={disabled}
          onSelectedChange={(on) =>
            void toggle(on, (value) => setUi({ reportReminder: { enabled: value } }))
          }
        />
      }
    />
  );

  const permissionRow = blocked ? (
    <ListRow
      icon={BellSlash}
      title={t("reminder__denied_title")}
      description={t("reminder__denied_hint")}
      onPress={() => void Linking.openSettings()}
    />
  ) : null;

  return { training, records, permissionRow };
}
