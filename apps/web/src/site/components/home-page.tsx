import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { CircleCheckIcon } from "lucide-react";
import { useEffect } from "react";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { confirmAccountDeleted } from "@/sync";

export function HomePage({ accountDeleted }: { accountDeleted: boolean }) {
  const { t } = useTranslation();
  // The server confirmed the deletion: remove this device's copy of that account's data.
  useEffect(() => {
    if (accountDeleted) void confirmAccountDeleted().catch(() => undefined);
  }, [accountDeleted]);
  return (
    <div className="flex flex-col items-start gap-6">
      {accountDeleted ? (
        <Alert variant="success">
          <CircleCheckIcon />
          <AlertDescription>{t("site__account_deleted")}</AlertDescription>
        </Alert>
      ) : null}
      <h1 className="font-semibold text-4xl tracking-tight">
        {t("site__home_title", { app: appConfig.displayName })}
      </h1>
      <p className="max-w-prose text-lg text-muted-foreground">{t("site__home_body")}</p>
      <Button size="lg" render={<Link to="/app" />}>
        {t("site__home_cta")}
      </Button>
    </div>
  );
}
