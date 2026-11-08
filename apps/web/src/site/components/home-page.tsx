import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { confirmAccountDeleted } from "@/sync";

export function HomePage({ accountDeleted }: { accountDeleted: boolean }) {
  const { t } = useTranslation();
  // The server confirmed the deletion: remove this device's copy of that account's data. The
  // confirmation shows once that finished, so leaving the page at once cannot cut the wipe short.
  const [localCopyRemoved, setLocalCopyRemoved] = useState(false);
  useEffect(() => {
    if (!accountDeleted) return;
    void confirmAccountDeleted()
      .catch(() => undefined)
      .finally(() => setLocalCopyRemoved(true));
  }, [accountDeleted]);
  return (
    <div className="flex flex-col items-start gap-6">
      {accountDeleted && localCopyRemoved ? (
        <Alert variant="success">
          <CheckCircleIcon />
          <AlertDescription>{t("site__account_deleted")}</AlertDescription>
        </Alert>
      ) : null}
      <h1 className="text-title-xl">{t("site__home_title", { app: appConfig.displayName })}</h1>
      <p className="max-w-prose text-body-lg text-muted-foreground">{t("site__home_body")}</p>
      <Button size="lg" render={<Link to="/app" />}>
        {t("site__home_cta")}
      </Button>
    </div>
  );
}
