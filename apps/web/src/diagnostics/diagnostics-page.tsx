import { Card, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";

import { useTranslation } from "@/platform/i18n";
import { StorageUnavailable } from "@/platform/powersync";
import { useDiagnostics } from "./use-diagnostics";

/** Local storage state of this device. The full sync diagnostics screen comes in phase 8. */
export function DiagnosticsPage() {
  const { t } = useTranslation();
  const state = useDiagnostics();
  if (state.status === "unavailable") return <StorageUnavailable reason={state.reason} />;
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("diagnostics__title")}</CardTitle>
          <CardDescription>
            {state.status === "loading" ? (
              t("diagnostics__loading")
            ) : (
              <dl className="grid gap-1">
                <dt>{t("diagnostics__install_id")}</dt>
                <dd data-testid="install-id" className="break-all font-mono">
                  {state.installId}
                </dd>
                <dt>{t("diagnostics__persistent")}</dt>
                <dd>{state.persisted ? t("diagnostics__yes") : t("diagnostics__no")}</dd>
              </dl>
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
