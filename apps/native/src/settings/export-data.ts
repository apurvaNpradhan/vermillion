import { strongCsv } from "@workspace/shared";
import { readSessionExportRows } from "@workspace/sync";
import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { deviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useLocalData } from "@/sync";

/**
 * Shares logged sets as a Strong-format CSV from the local database. Weights are in kilograms and
 * dates use the device time zone. The next export replaces the cached file.
 */
export function useExportData() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const [pending, setPending] = useState(false);
  const activeExport = useRef<AbortController | null>(null);
  const database = local?.status === "ready" ? local.database : null;
  useEffect(() => () => activeExport.current?.abort(), [database]);

  const run = useCallback(async () => {
    if (!database || activeExport.current) return;
    const task = new AbortController();
    activeExport.current = task;
    setPending(true);
    try {
      const rows = await readSessionExportRows(database);
      if (task.signal.aborted) return;
      if (rows.length === 0) {
        toast.show({ label: t("settings__export_empty") });
        return;
      }
      if (!(await isAvailableAsync())) {
        if (!task.signal.aborted)
          toast.show({ variant: "danger", label: t("settings__export_failed") });
        return;
      }
      if (task.signal.aborted) return;
      const folder = new Directory(Paths.cache, "export");
      folder.create({ idempotent: true, intermediates: true });
      const file = new File(folder, `${appConfig.displayName.toLowerCase()}-history.csv`);
      file.create({ overwrite: true });
      file.write(strongCsv(rows, { timeZone: deviceTimeZone() }));
      await shareAsync(file.uri, {
        mimeType: "text/csv",
        UTI: "public.comma-separated-values-text",
        dialogTitle: t("settings__export_title"),
      });
    } catch {
      if (!task.signal.aborted)
        toast.show({ variant: "danger", label: t("settings__export_failed") });
    } finally {
      activeExport.current = null;
      setPending(false);
    }
  }, [database, t, toast]);

  return { run, pending, ready: database !== null };
}
