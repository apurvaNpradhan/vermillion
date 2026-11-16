import { HeightRow } from "@/body";
import { useRouter } from "expo-router";
import { Fingerprint } from "phosphor-react-native";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";

import { ProfileSection } from "./profile-section";

/** The profile, pushed from settings: a hero, the editable details, then security. */
export function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ScrollPage title={t("settings__profile_title")} back>
      <ProfileSection />
      <ListSection>
        <HeightRow />
      </ListSection>
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
