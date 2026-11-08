import { useCurrentUser } from "@/account";
import { Card, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";

import { useTranslation } from "@/platform/i18n";

/** Landing page of the signed-in app. The notes example slice replaces the placeholder card. */
export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-title-xl">{t("dashboard__welcome", { name: user?.name ?? "" })}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard__placeholder_title")}</CardTitle>
          <CardDescription>{t("dashboard__placeholder_body")}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
