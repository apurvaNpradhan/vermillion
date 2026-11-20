import { Switch } from "heroui-native";
import {
  ArrowsDownUp,
  Bell,
  CheckCircle,
  Hourglass,
  Keyboard,
  ListChecks,
  Medal,
  SpeakerHigh,
  Sun,
  Timer,
  Trophy,
} from "phosphor-react-native";
import { useState, type ReactNode } from "react";
import { Linking } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ListRow } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { usePreferences } from "@/preferences";

import {
  askNotificationPermission,
  useNotificationPermission,
} from "@/platform/notifications/permission-store";

/**
 * The session settings, as rows and the sheets they open. `soundRows` go in a "Sounds" section,
 * `rows` in the Training section, and `sheets` render beside them. Settings and the Session's own
 * settings sheet use the same rows, so they behave the same.
 */
export type SessionSettings = { soundRows: ReactNode[]; rows: ReactNode[]; sheets: ReactNode };

type Picker = "view" | null;

/**
 * The session rows of Settings: the Sounds (a master switch, and the Rest, set and milestone
 * groups under it while it is on), whether Rest notifications are allowed (it shows the system's
 * answer, and opens the system settings once the user has declined or to change it), and whether
 * the screen stays awake during a workout.
 */
export function useSessionSettings(): SessionSettings {
  const { t } = useTranslation();
  const { preferences, setUi } = usePreferences();
  const permission = useNotificationPermission();
  const [picker, setPicker] = useState<Picker>(null);
  const {
    keepAwake,
    sounds,
    soundRest,
    soundSets,
    soundMilestones,
    sessionView,
    systemKeyboard,
    inlineTimer,
    supersetScroll,
    recordAlerts,
  } = preferences.ui;

  // The logging controls: one switch each, the same in Settings and in the Session's sheet.
  const controls = [
    {
      key: "systemKeyboard",
      icon: Keyboard,
      title: t("session__setting_system_keyboard"),
      hint: t("session__setting_system_keyboard_hint"),
      on: systemKeyboard,
      patch: (on: boolean) => ({ systemKeyboard: on }),
    },
    {
      key: "inlineTimer",
      icon: Hourglass,
      title: t("session__setting_inline_timer"),
      hint: t("session__setting_inline_timer_hint"),
      on: inlineTimer,
      patch: (on: boolean) => ({ inlineTimer: on }),
    },
    {
      key: "supersetScroll",
      icon: ArrowsDownUp,
      title: t("session__setting_superset_scroll"),
      hint: t("session__setting_superset_scroll_hint"),
      on: supersetScroll,
      patch: (on: boolean) => ({ supersetScroll: on }),
    },
    {
      key: "recordAlerts",
      icon: Medal,
      title: t("session__setting_record_alerts"),
      hint: t("session__setting_record_alerts_hint"),
      on: recordAlerts,
      patch: (on: boolean) => ({ recordAlerts: on }),
    },
  ] as const;
  const controlRows = controls.map((control) => (
    <ListRow
      key={control.key}
      icon={control.icon}
      title={control.title}
      description={control.hint}
      accessory="none"
      checked={control.on}
      onPress={() => setUi(control.patch(!control.on))}
      trailing={
        <Switch
          accessibilityLabel={control.title}
          isSelected={control.on}
          onSelectedChange={(value) => setUi(control.patch(value))}
        />
      }
    />
  ));

  const notificationStatus =
    permission === "granted"
      ? t("session__setting_on")
      : permission === "denied"
        ? t("session__setting_denied")
        : t("session__setting_not_set");

  const groups = [
    {
      key: "soundRest",
      icon: Timer,
      title: t("session__setting_sound_rest"),
      hint: t("session__setting_sound_rest_hint"),
      on: soundRest,
      patch: (on: boolean) => ({ soundRest: on }),
    },
    {
      key: "soundSets",
      icon: CheckCircle,
      title: t("session__setting_sound_sets"),
      hint: t("session__setting_sound_sets_hint"),
      on: soundSets,
      patch: (on: boolean) => ({ soundSets: on }),
    },
    {
      key: "soundMilestones",
      icon: Trophy,
      title: t("session__setting_sound_milestones"),
      hint: t("session__setting_sound_milestones_hint"),
      on: soundMilestones,
      patch: (on: boolean) => ({ soundMilestones: on }),
    },
  ] as const;

  const soundRows = [
    <ListRow
      key="sounds"
      icon={SpeakerHigh}
      title={t("session__setting_sounds")}
      description={t("session__setting_sounds_hint")}
      accessory="none"
      checked={sounds}
      onPress={() => setUi({ sounds: !sounds })}
      trailing={
        <Switch
          accessibilityLabel={t("session__setting_sounds")}
          isSelected={sounds}
          onSelectedChange={(value) => setUi({ sounds: value })}
        />
      }
    />,
    ...(sounds
      ? groups.map((group) => (
          <ListRow
            key={group.key}
            icon={group.icon}
            title={group.title}
            description={group.hint}
            accessory="none"
            checked={group.on}
            onPress={() => setUi(group.patch(!group.on))}
            trailing={
              <Switch
                accessibilityLabel={group.title}
                isSelected={group.on}
                onSelectedChange={(value) => setUi(group.patch(value))}
              />
            }
          />
        ))
      : []),
  ];
  const rows = [
    <ListRow
      key="session-view"
      icon={ListChecks}
      title={t("session__setting_view")}
      value={t(sessionView === "timer" ? "session__view_timer" : "session__view_sets")}
      onPress={() => setPicker("view")}
    />,
    <ListRow
      key="rest-notifications"
      icon={Bell}
      title={t("session__setting_rest_notifications")}
      value={notificationStatus}
      accessibilityHint={t(
        permission === "undetermined"
          ? "session__setting_rest_hint_ask"
          : "session__setting_rest_hint_open",
      )}
      onPress={() => {
        if (permission === "undetermined") void askNotificationPermission();
        else void Linking.openSettings();
      }}
    />,
    <ListRow
      key="keep-awake"
      icon={Sun}
      title={t("session__setting_keep_awake")}
      description={t("session__setting_keep_awake_hint")}
      accessory="none"
      checked={keepAwake}
      onPress={() => setUi({ keepAwake: !keepAwake })}
      trailing={
        <Switch
          accessibilityLabel={t("session__setting_keep_awake")}
          isSelected={keepAwake}
          onSelectedChange={(value) => setUi({ keepAwake: value })}
        />
      }
    />,
    ...controlRows,
  ];

  const onOpenChange = (open: boolean) => {
    if (!open) setPicker(null);
  };
  const sheets = (
    <>
      <OptionSheet
        isOpen={picker === "view"}
        onOpenChange={onOpenChange}
        title={t("session__setting_view")}
        description={t("session__setting_view_hint")}
        options={[
          { value: "sets", label: t("session__view_sets") },
          { value: "timer", label: t("session__view_timer") },
        ]}
        value={sessionView}
        onSelect={(value) => setUi({ sessionView: value })}
      />
    </>
  );
  return { soundRows, rows, sheets };
}
