import { isNetworkError } from "@workspace/client/network-error";
import { useRouter } from "expo-router";
import { SignOut, Trash, UserCircle } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useSignOut } from "@/auth";
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
 * Settings as grouped rows: preferences that open picker sheets, the profile, then sign-out and account deletion apart at the bottom, and the app version.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const signOut = useSignOut();
  const { requestSignOut, confirmationProps } = useSignOutConfirmation(() => signOut.mutate());
  const sessionSettings = useSessionSettings();
  const training = useTrainingPreferenceRows({ extraRows: sessionSettings.rows });

  return (
    <>
      <ConfirmationDialog {...confirmationProps} />
      {sessionSettings.sheets}
      {training.sheets}
      <ScrollPage title={t("settings__title")}>
        <View>
          <SyncBanner />
        </View>
        <View>
          <PreferenceRows />
        </View>
        <ListSection title={t("session__setting_sounds")}>{sessionSettings.soundRows}</ListSection>
        <View>{training.section}</View>
        <ListSection title={t("settings__section_account")}>
          <ListRow
            icon={UserCircle}
            title={t("settings__nav_profile")}
            onPress={() => router.push("/settings/profile")}
          />
        </ListSection>
        {isNetworkError(signOut.error) ? <FormError message={t("errors__offline")} /> : null}
        <ListSection>
          <ListRow
            icon={SignOut}
            title={t("nav__sign_out")}
            accessory="none"
            disabled={signOut.isPending}
            onPress={() => void requestSignOut()}
          />
          <ListRow
            icon={Trash}
            title={t("settings__delete_title")}
            tone="danger"
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
