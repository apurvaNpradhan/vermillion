import { useAppToast } from "@/platform/ui/use-app-toast";
import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { localDataReset } from "./local-data-reset";

/** Tells the user the local database was set aside and that unsent changes may be lost. */
export function LocalDataResetNotice() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const event = useSyncExternalStore(localDataReset.subscribe, localDataReset.get);

  useEffect(() => {
    if (event === null) return;
    toast.show({
      variant: "warning",
      label: t("sync__local_reset_title"),
      description: t("sync__local_reset_body"),
      duration: "persistent",
    });
    localDataReset.dismiss();
  }, [event, toast, t]);

  return null;
}
