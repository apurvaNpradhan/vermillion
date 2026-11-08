import { Text } from "react-native";

import { useCurrentUser } from "@/account";
import { useTranslation } from "@/platform/i18n";
import { Screen } from "@/platform/ui/screen";
import { Card } from "@/platform/ui/card";

/** Landing screen of the signed-in app. The notes example slice replaces the placeholder card. */
export function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  return (
    <Screen>
      <Text className="font-semibold text-title-xl text-foreground">
        {t("dashboard__welcome", { name: user?.name ?? "" })}
      </Text>
      <Card>
        <Card.Header>
          <Card.Title>{t("dashboard__placeholder_title")}</Card.Title>
          <Card.Description>{t("dashboard__placeholder_body")}</Card.Description>
        </Card.Header>
      </Card>
    </Screen>
  );
}
