import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ScrollPage } from "@/platform/ui/page";

import { AccountAvatar } from "./account-summary";
import { ProfileSection } from "./profile-section";

/** The profile, pushed from settings: the avatar, then the editable name and the email. */
export function ProfileScreen() {
  const { t } = useTranslation();
  return (
    <ScrollPage title={t("settings__profile_title")} back>
      <View className="items-center gap-3 pt-2">
        <AccountAvatar size="lg" />
        <Text className="text-center text-body text-muted">{t("settings__profile_hint")}</Text>
      </View>
      <ProfileSection />
    </ScrollPage>
  );
}
