import { AvatarPicker } from "@/account";
import { useBodyReminderRows, HidePhotosRow, WeightPreferenceRow } from "@/body";
import { isNetworkError } from "@workspace/client/network-error";
import { useRouter } from "expo-router";
import { SignOut, Trash } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useSignOut } from "@/auth";
import { useIsOnline } from "@/platform/network";
import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { FormError } from "@/platform/ui/form-error";
import { ListRow, ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";
import { PreferenceRows } from "@/preferences";
import { useSessionSettings } from "@/session";
import { useTrainingPreferenceRows } from "@/training";
import { SyncBanner, useSignOutConfirmation } from "@/sync";

/**
 * Settings as grouped rows: the profile picture, then Appearance, Training, Body and Account, and
 * the app version. Rows that open picker sheets show their current value; switches sit with the
 * training settings they belong to.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const signOut = useSignOut();
  const online = useIsOnline();
  const { requestSignOut, confirmationProps } = useSignOutConfirmation(() => signOut.mutate());
  const sessionSettings = useSessionSettings();
  const reminders = useBodyReminderRows();
  const training = useTrainingPreferenceRows({
    extraRows: [...sessionSettings.rows, ...sessionSettings.soundRows],
  });

  return (
    <>
      <ConfirmationDialog {...confirmationProps} />
      {sessionSettings.sheets}
      {training.sheets}
      {reminders.editor}
      <ScrollPage title={t("settings__title")}>
        <AvatarPicker />
        <View>
          <SyncBanner />
        </View>
        <PreferenceRows />
        {training.section}
        <ListSection title={t("settings__section_body")}>
          <WeightPreferenceRow />
          <HidePhotosRow />
          <ListRow
            title={t("body__tracked_metrics")}
            onPress={() => router.push("/settings/tracked-metrics")}
          />
          {reminders.rows}
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
        <Text className="text-center text-caption text-muted">
          {t("settings__version", { name: appConfig.displayName, version: appConfig.version })}
        </Text>
      </ScrollPage>
    </>
  );
}
