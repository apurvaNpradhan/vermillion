import { useForm, useStore } from "@tanstack/react-form";
import type { UiPreferences } from "@workspace/shared";
import { BottomSheet, useThemeColor } from "heroui-native";
import { Bell, Minus, Plus } from "phosphor-react-native";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { Button } from "@/platform/ui/button";
import { ListRow } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { useSheetPresent } from "@/platform/ui/use-sheet-present";
import { usePreferences } from "@/preferences";
import { getNotificationPermission } from "@/platform/notifications/permission";
import { askNotificationPermission } from "@/platform/notifications/permission-store";

type ReminderKey = "weighInReminder" | "checkInReminder";
function ReminderEditor({
  kind,
  initial,
  onClose,
}: {
  kind: ReminderKey;
  initial: UiPreferences["checkInReminder"];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const foreground = useThemeColor("foreground");
  const sheet = useSheetPresent();
  const { setUiAsync } = usePreferences();
  const form = useForm({ defaultValues: { reminder: initial } });
  const draft = useStore(form.store, (state) => state.values.reminder);
  const setDraft = (value: typeof initial) => form.setFieldValue("reminder", value);
  const [weekdayOpen, setWeekdayOpen] = useState(false);
  const [explain, setExplain] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [hour = "08", minute = "00"] = draft.time.split(":");
  const weekdayOptions = Array.from({ length: 7 }, (_, index) => ({
    value: String(index + 1),
    label: new Intl.DateTimeFormat(i18n.language, { weekday: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 10, 15 + index)),
    ),
  }));
  const enable = async () => {
    setBusy(true);
    try {
      const permission = await getNotificationPermission();
      if (permission === "granted") setDraft({ ...draft, enabled: true });
      else if (permission === "denied") setDenied(true);
      else setExplain(true);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError(false);
    try {
      await setUiAsync(
        kind === "weighInReminder"
          ? { weighInReminder: { enabled: draft.enabled, time: draft.time } }
          : { checkInReminder: draft },
      );
      onClose();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <BottomSheet
        isOpen={sheet.isOpen && !weekdayOpen}
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
      >
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            animationConfigs={SHEET_SPRING}
            backgroundClassName="bg-overlay"
            contentContainerClassName="gap-4 px-4 pb-8"
          >
            {sheet.probe}
            <BottomSheet.Title>
              {t(
                kind === "weighInReminder"
                  ? "body__reminder_weight_title"
                  : "body__reminder_check_title",
              )}
            </BottomSheet.Title>
            {explain ? (
              <View className="gap-3">
                <Text className="font-normal text-body text-foreground">
                  {t("body__reminder_permission")}
                </Text>
                <Button
                  isDisabled={busy}
                  onPress={() => {
                    setBusy(true);
                    void askNotificationPermission()
                      .then(getNotificationPermission)
                      .then((permission) => {
                        setDraft({ ...draft, enabled: permission === "granted" });
                        setDenied(permission !== "granted");
                        setExplain(false);
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  <Button.Label>{t("session__rest_permission_allow")}</Button.Label>
                </Button>
                <Button variant="secondary" onPress={() => setExplain(false)}>
                  <Button.Label>{t("session__rest_permission_decline")}</Button.Label>
                </Button>
              </View>
            ) : (
              <>
                <ListRow
                  title={t("body__reminder_enabled")}
                  value={t(draft.enabled ? "session__setting_on" : "session__setting_off")}
                  disabled={busy}
                  onPress={() => {
                    if (draft.enabled) setDraft({ ...draft, enabled: false });
                    else void enable();
                  }}
                />
                {denied ? (
                  <Button variant="secondary" onPress={() => void Linking.openSettings()}>
                    <Button.Label>{t("body__reminder_open_settings")}</Button.Label>
                  </Button>
                ) : null}
                {kind === "checkInReminder" ? (
                  <ListRow
                    title={t("body__reminder_weekday")}
                    value={
                      weekdayOptions.find((option) => Number(option.value) === draft.weekday)?.label
                    }
                    onPress={() => setWeekdayOpen(true)}
                  />
                ) : null}
                <View className="flex-row gap-4">
                  {[
                    {
                      part: "hour",
                      count: 24,
                      step: 1,
                      selected: hour,
                      label: t("body__reminder_hour"),
                    },
                    {
                      part: "minute",
                      count: 60,
                      step: 5,
                      selected: minute,
                      label: t("body__reminder_minute"),
                    },
                  ].map((column) => {
                    const move = (direction: 1 | -1) => {
                      const next =
                        (Number(column.selected) + direction * column.step + column.count) %
                        column.count;
                      const text = String(next).padStart(2, "0");
                      setDraft({
                        ...draft,
                        time: column.part === "hour" ? `${text}:${minute}` : `${hour}:${text}`,
                      });
                    };
                    return (
                      <View key={column.part} className="flex-1 gap-2">
                        <Text className="font-normal text-body text-foreground">
                          {column.label}
                        </Text>
                        <View className="flex-row items-center justify-between rounded-xl bg-default">
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t("session__key_decrease", { step: column.step })}
                            disabled={busy}
                            onPress={() => move(-1)}
                            className="h-12 w-12 items-center justify-center"
                          >
                            <Minus size={20} color={foreground} />
                          </Pressable>
                          <Text
                            accessibilityLabel={t("body__reminder_time_option", {
                              part: column.label,
                              value: column.selected,
                            })}
                            className="font-medium text-numeric-md tabular-nums text-foreground"
                          >
                            {column.selected}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t("session__key_increase", { step: column.step })}
                            disabled={busy}
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
                {error ? (
                  <Text accessibilityRole="alert" className="font-normal text-body text-danger">
                    {t("errors__unknown")}
                  </Text>
                ) : null}
                <Button isDisabled={busy} onPress={() => void save()}>
                  <Button.Label>{t("body__save")}</Button.Label>
                </Button>
              </>
            )}
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
      {kind === "checkInReminder" && sheet.isOpen ? (
        <OptionSheet
          isOpen={weekdayOpen}
          onOpenChange={setWeekdayOpen}
          title={t("body__reminder_weekday")}
          options={weekdayOptions}
          value={String(draft.weekday)}
          onSelect={(value) => setDraft({ ...draft, weekday: Number(value) })}
        />
      ) : null}
    </>
  );
}
/**
 * The two reminder rows (daily weigh-in, weekly check-in) and the sheet that edits one. The rows
 * go in a settings group; the editor renders outside it.
 */
export function useBodyReminderRows() {
  const { preferences, isLoading } = usePreferences();
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState<ReminderKey | null>(null);
  const ui = preferences.ui;
  const label = (kind: ReminderKey) => {
    const reminder = ui[kind];
    if (!reminder.enabled) return t("session__setting_off");
    const [hour = 0, minute = 0] = reminder.time.split(":").map(Number);
    const date = new Date(2026, 10, 15, hour, minute);
    const time = new Intl.DateTimeFormat(i18n.language, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
    if (kind === "weighInReminder") return time;
    date.setDate(date.getDate() + ui.checkInReminder.weekday - 1);
    return t("body__reminder_weekly_value", {
      time,
      weekday: new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(date),
    });
  };
  const rows = (
    <>
      <ListRow
        icon={Bell}
        title={t("body__reminder_weight_title")}
        value={label("weighInReminder")}
        disabled={isLoading}
        onPress={() => setEditing("weighInReminder")}
      />
      <ListRow
        icon={Bell}
        title={t("body__reminder_check_title")}
        value={label("checkInReminder")}
        disabled={isLoading}
        onPress={() => setEditing("checkInReminder")}
      />
    </>
  );
  const editor = editing ? (
    <ReminderEditor
      key={editing}
      kind={editing}
      initial={
        editing === "checkInReminder" ? ui.checkInReminder : { ...ui.weighInReminder, weekday: 1 }
      }
      onClose={() => setEditing(null)}
    />
  ) : null;
  return { rows, editor };
}
