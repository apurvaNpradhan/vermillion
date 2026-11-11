import { Bell, SpeakerHigh, Sun } from "phosphor-react-native";
import { useState, type ReactNode } from "react";
import { Linking } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ListRow } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { usePreferences } from "@/preferences";

import { askRestPermission, useRestPermission } from "./rest-permission-store";

/** The rows for the Training section and the sheets they open. */
export type SessionSettings = { rows: ReactNode[]; sheets: ReactNode };

const ON = "on";
const OFF = "off";

/**
 * The Settings → Training rows of the Session: whether Rest notifications are allowed (it shows
 * the system's answer, and opens the system settings once the user has declined or to change it)
 * and whether the Rest ends with a chime, whether the screen stays awake during a workout. `rows` go in the Training section; `sheets`
 * render beside it.
 */
export function useSessionSettings(): SessionSettings {
  const { t } = useTranslation();
  const { preferences, setUi } = usePreferences();
  const permission = useRestPermission();
  const [pickingAwake, setPickingAwake] = useState(false);
  const keepAwake = preferences.ui.keepAwake;
  const restSound = preferences.ui.restSound;
  const [pickingSound, setPickingSound] = useState(false);

  const notificationStatus =
    permission === "granted"
      ? t("session__setting_on")
      : permission === "denied"
        ? t("session__setting_denied")
        : t("session__setting_not_set");

  const rows = [
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
      key="rest-sound"
      icon={SpeakerHigh}
      title={t("session__setting_rest_sound")}
      value={restSound ? t("session__setting_on") : t("session__setting_off")}
      onPress={() => setPickingSound(true)}
    />,
    <ListRow
      key="keep-awake"
      icon={Sun}
      title={t("session__setting_keep_awake")}
      value={keepAwake ? t("session__setting_on") : t("session__setting_off")}
      onPress={() => setPickingAwake(true)}
    />,
  ];
  const sheets = (
    <>
      <OptionSheet
        isOpen={pickingSound}
        onOpenChange={setPickingSound}
        title={t("session__setting_rest_sound")}
        description={t("session__setting_rest_sound_hint")}
        options={[
          { value: ON, label: t("session__setting_on") },
          { value: OFF, label: t("session__setting_off") },
        ]}
        value={restSound ? ON : OFF}
        onSelect={(value) => setUi({ restSound: value === ON })}
      />
      <OptionSheet
        isOpen={pickingAwake}
        onOpenChange={setPickingAwake}
        title={t("session__setting_keep_awake")}
        description={t("session__setting_keep_awake_hint")}
        options={[
          { value: ON, label: t("session__setting_on") },
          { value: OFF, label: t("session__setting_off") },
        ]}
        value={keepAwake ? ON : OFF}
        onSelect={(value) => setUi({ keepAwake: value === ON })}
      />
    </>
  );
  return { rows, sheets };
}
