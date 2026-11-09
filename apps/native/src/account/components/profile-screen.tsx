import { useRouter } from "expo-router";
import { Fingerprint } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";

import { initials } from "./account-summary";
import { ProfileSection } from "./profile-section";
import { useCurrentUser } from "../use-current-user";

/** Large initials disc with the name and email under it. */
function ProfileHero() {
  const { user } = useCurrentUser();
  return (
    <View className="items-center gap-3 pb-2 pt-4">
      <View className="size-24 items-center justify-center rounded-full bg-default">
        <Text className="font-semibold text-[34px] text-foreground">
          {user ? initials(user.name) : ""}
        </Text>
      </View>
      <View className="items-center gap-0.5 px-4">
        <Text numberOfLines={1} className="font-semibold text-title-lg text-foreground">
          {user?.name ?? " "}
        </Text>
        <Text numberOfLines={1} className="text-body text-muted">
          {user?.email ?? " "}
        </Text>
      </View>
    </View>
  );
}

/** The profile, pushed from settings: a hero, the editable details, then security. */
export function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ScrollPage title={t("settings__profile_title")} back>
      <ProfileHero />
      <ProfileSection />
      <ListSection title={t("settings__profile_security")}>
        <ListRow
          icon={Fingerprint}
          title={t("passkeys__row")}
          onPress={() => router.push("/settings/passkeys")}
        />
      </ListSection>
    </ScrollPage>
  );
}
