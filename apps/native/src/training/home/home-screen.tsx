import { useTranslation } from "@/platform/i18n";
import { ScrollPage } from "@/platform/ui/page";
import { usePreferences } from "@/preferences";
import { SyncBanner } from "@/sync";
import { TrainingHome } from "./training-home";

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { timeZone } = usePreferences();
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timeZone,
  }).format(new Date());
  return (
    <ScrollPage title={t("home__title")} overline={date}>
      <SyncBanner />
      <TrainingHome />
    </ScrollPage>
  );
}
