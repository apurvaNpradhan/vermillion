import { useForm, useStore } from "@tanstack/react-form";
import type { UiPreferences } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { Bell } from "phosphor-react-native";
import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { usePreferences } from "@/preferences";
import { getRestPermission, askRestPermission } from "@/session";

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
      const permission = await getRestPermission();
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
        isOpen={!weekdayOpen}
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
      >
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            backgroundClassName="bg-overlay"
            contentContainerClassName="gap-4 px-4 pb-8"
          >
            <BottomSheet.Title>
              {t(
                kind === "weighInReminder"
                  ? "body__reminder_weight_title"
                  : "body__reminder_check_title",
              )}
            </BottomSheet.Title>
            {explain ? (
              <View className="gap-3">
                <Text className="text-body text-foreground">{t("body__reminder_permission")}</Text>
                <Button
                  isDisabled={busy}
                  onPress={() => {
                    setBusy(true);
                    void askRestPermission()
                      .then(getRestPermission)
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
                    { part: "hour", count: 24, selected: hour, label: t("body__reminder_hour") },
                    {
                      part: "minute",
                      count: 60,
                      selected: minute,
                      label: t("body__reminder_minute"),
                    },
                  ].map((column) => (
                    <View key={column.part} className="flex-1 gap-2">
                      <Text className="text-body text-foreground">{column.label}</Text>
                      <ScrollView style={{ maxHeight: 200 }}>
                        <View className="flex-row flex-wrap">
                          {Array.from({ length: column.count }, (_, value) => {
                            const text = String(value).padStart(2, "0");
                            return (
                              <Pressable
                                key={text}
                                accessibilityRole="button"
                                accessibilityLabel={t("body__reminder_time_option", {
                                  part: column.label,
                                  value: text,
                                })}
                                accessibilityState={{ selected: text === column.selected }}
                                disabled={busy}
                                onPress={() =>
                                  setDraft({
                                    ...draft,
                                    time:
                                      column.part === "hour"
                                        ? `${text}:${minute}`
                                        : `${hour}:${text}`,
                                  })
                                }
                                className={`min-h-12 w-1/3 items-center justify-center rounded-xl ${text === column.selected ? "bg-default" : ""}`}
                              >
                                <Text className="text-body tabular-nums text-foreground">
                                  {text}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  ))}
                </View>
                {error ? (
                  <Text accessibilityRole="alert" className="text-body text-danger">
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
      <OptionSheet
        isOpen={weekdayOpen}
        onOpenChange={setWeekdayOpen}
        title={t("body__reminder_weekday")}
        options={weekdayOptions}
        value={String(draft.weekday)}
        onSelect={(value) => setDraft({ ...draft, weekday: Number(value) })}
      />
    </>
  );
}
export function BodyReminderSettings() {
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
  return (
    <>
      <ListSection title={t("body__reminder_section")}>
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
      </ListSection>
      {editing ? (
        <ReminderEditor
          key={editing}
          kind={editing}
          initial={
            editing === "checkInReminder"
              ? ui.checkInReminder
              : { ...ui.weighInReminder, weekday: 1 }
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
