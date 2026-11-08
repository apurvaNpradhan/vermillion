import { useRouter } from "expo-router";
import { SignOut, Trash, UserCircle } from "phosphor-react-native";
import { Text } from "react-native";

import { AccountSummary } from "@/account";
import { useSignOut } from "@/auth";
import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";
import { PreferenceRows } from "@/preferences";
import { SyncBanner, useSignOutConfirmation } from "@/sync";

/**
 * Settings as grouped rows: the account card, preferences that open picker sheets, the
 * profile, then sign-out and account deletion apart at the bottom, and the app version.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const signOut = useSignOut();
  const requestSignOut = useSignOutConfirmation(() => signOut.mutate());

  return (
    <ScrollPage title={t("settings__title")}>
      <SyncBanner />
      <AccountSummary variant="card" />
      <PreferenceRows />
      <ListSection title={t("settings__section_account")}>
        <ListRow
          icon={UserCircle}
          title={t("settings__nav_profile")}
          onPress={() => router.push("/settings/profile")}
        />
      </ListSection>
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
  );
}
