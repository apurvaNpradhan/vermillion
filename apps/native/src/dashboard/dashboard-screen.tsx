import { useCurrentUser } from "@/account";
import { useTranslation } from "@/platform/i18n";
import { ScrollPage } from "@/platform/ui/page";
import { Card } from "@/platform/ui/card";

/** Landing screen of the signed-in app. The notes example slice replaces the placeholder card. */
export function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  return (
    <ScrollPage title={user ? t("dashboard__welcome", { name: user.name }) : t("nav__home")}>
      <Card>
        <Card.Header>
          <Card.Title>{t("dashboard__placeholder_title")}</Card.Title>
          <Card.Description>{t("dashboard__placeholder_body")}</Card.Description>
        </Card.Header>
      </Card>
    </ScrollPage>
  );
}
