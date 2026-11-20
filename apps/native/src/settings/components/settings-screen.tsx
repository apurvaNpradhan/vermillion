import { AvatarPicker } from "@/account";
import { useBodyReminderRows, HidePhotosRow, WeightPreferenceRow } from "@/body";
import { isNetworkError } from "@workspace/client/network-error";
import { useRouter } from "expo-router";
import {
  Barbell,
  ChatCircleText,
  DownloadSimple,
  Info,
  SignOut,
  Trash,
} from "phosphor-react-native";
import { Linking, View } from "react-native";

import { useSignOut } from "@/auth";
import { useIsOnline } from "@/platform/network";
import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { FormError } from "@/platform/ui/form-error";
import { ListRow, ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";
import { PreferenceRows } from "@/preferences";
import { useTrainingPreferenceRows } from "@/training";
import { SyncBanner, useSignOutConfirmation } from "@/sync";

import { useExportData } from "../export-data";

/**
 * Settings as grouped rows: the profile picture, Preferences (appearance, language, time zone,
 * units), Workouts (a pushed page of its own), Body, Help, Data and Account. Rows that open picker
 * sheets show their current value.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const signOut = useSignOut();
  const online = useIsOnline();
  const { requestSignOut, confirmationProps } = useSignOutConfirmation(() => signOut.mutate());
  const reminders = useBodyReminderRows();
  const training = useTrainingPreferenceRows();
  const exportData = useExportData();

  return (
    <>
      <ConfirmationDialog {...confirmationProps} />
      {training.sheets}
      {reminders.editor}
      <ScrollPage title={t("settings__title")}>
        <AvatarPicker />
        <View>
          <SyncBanner />
        </View>
        <PreferenceRows>{training.rows.unit}</PreferenceRows>
        <ListSection title={t("settings__workouts_title")}>
          <ListRow
            icon={Barbell}
            title={t("settings__workouts_screen")}
            description={t("settings__workouts_hint")}
            onPress={() => router.push("/settings/workouts")}
          />
        </ListSection>
        <ListSection title={t("settings__section_body")}>
          <WeightPreferenceRow />
          <HidePhotosRow />
          <ListRow
            title={t("body__tracked_metrics")}
            onPress={() => router.push("/settings/tracked-metrics")}
          />
          {reminders.rows}
        </ListSection>
        <ListSection title={t("settings__section_help")}>
          <ListRow
            icon={ChatCircleText}
            title={t("settings__feedback")}
            accessory="none"
            onPress={() =>
              void Linking.openURL(
                `mailto:${appConfig.supportEmail}?subject=${encodeURIComponent(
                  t("settings__feedback_subject", { name: appConfig.displayName }),
                )}`,
              )
            }
          />
          <ListRow
            icon={Info}
            title={t("settings__about")}
            accessory="none"
            value={t("settings__version", {
              name: appConfig.displayName,
              version: appConfig.version,
            })}
          />
        </ListSection>
        <ListSection title={t("settings__section_data")}>
          <ListRow
            icon={DownloadSimple}
            title={t("settings__export_title")}
            description={t("settings__export_hint")}
            accessory="none"
            disabled={!exportData.ready || exportData.pending}
            onPress={() => void exportData.run()}
          />
        </ListSection>
        {isNetworkError(signOut.error) ? <FormError message={t("errors__offline")} /> : null}
        <ListSection title={t("settings__section_account")}>
          <ListRow
            icon={SignOut}
            title={t("nav__sign_out")}
            accessory="none"
            description={online ? undefined : t("common__needs_connection")}
            disabled={signOut.isPending || !online}
            onPress={() => void requestSignOut()}
          />
          <ListRow
            icon={Trash}
            title={t("settings__delete_title")}
            tone="danger"
            description={online ? undefined : t("common__needs_connection")}
            disabled={!online}
            onPress={() => router.push("/settings/delete-account")}
          />
        </ListSection>
      </ScrollPage>
    </>
  );
}
