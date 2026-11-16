import { Switch } from "heroui-native";
import {
  Bell,
  CheckCircle,
  ListChecks,
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

import { askRestPermission, useRestPermission } from "./rest-permission-store";

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
  const permission = useRestPermission();
  const [picker, setPicker] = useState<Picker>(null);
  const { keepAwake, sounds, soundRest, soundSets, soundMilestones, sessionView } = preferences.ui;

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
        if (permission === "undetermined") void askRestPermission();
        else void Linking.openSettings();
      }}
    />,
    <ListRow
      key="keep-awake"
      icon={Sun}
      title={t("session__setting_keep_awake")}
      description={t("session__setting_keep_awake_hint")}
      accessory="none"
      onPress={() => setUi({ keepAwake: !keepAwake })}
      trailing={
        <Switch
          accessibilityLabel={t("session__setting_keep_awake")}
          isSelected={keepAwake}
          onSelectedChange={(value) => setUi({ keepAwake: value })}
        />
      }
    />,
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
