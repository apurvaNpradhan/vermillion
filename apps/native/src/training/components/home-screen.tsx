import { useCurrentUser } from "@/account";
import { useTranslation } from "@/platform/i18n";
import { ScrollPage } from "@/platform/ui/page";
import { SyncBanner } from "@/sync";
import { TrainingHome } from "./training-home";

export function HomeScreen() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  return (
    <ScrollPage title={user ? t("dashboard__welcome", { name: user.name }) : t("nav__home")}>
      <SyncBanner />
      <TrainingHome />
    </ScrollPage>
  );
}
