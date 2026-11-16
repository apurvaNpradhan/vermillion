import { HeightRow } from "@/body";

import { useTranslation } from "@/platform/i18n";
import { ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";

import { ProfileSection } from "./profile-section";

/** The profile, pushed from settings: a hero, then the editable details. */
export function ProfileScreen() {
  const { t } = useTranslation();
  return (
    <ScrollPage title={t("settings__profile_title")} back>
      <ProfileSection />
      <ListSection>
        <HeightRow />
      </ListSection>
    </ScrollPage>
  );
}
