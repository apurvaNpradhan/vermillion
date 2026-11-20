import { sessionsCsv } from "@workspace/shared";
import { readSessionExportRows } from "@workspace/sync";
import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { useCallback, useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { usePreferences } from "@/preferences";
import { useLocalData } from "@/sync";

/**
 * "Export data": every finished Session as a CSV file from the local database (no network),
 * handed to the system share sheet. The file lives in the cache folder and is replaced by the next
 * export.
 */
export function useExportData() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const { preferences } = usePreferences();
  const local = useLocalData();
  const [pending, setPending] = useState(false);
  const database = local?.status === "ready" ? local.database : null;

  const run = useCallback(async () => {
    if (!database || pending) return;
    setPending(true);
    try {
      const rows = await readSessionExportRows(database);
      const timeZone =
        preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
      const csv = sessionsCsv(rows, {
        unit: preferences.ui.weightUnit,
        effortScale: preferences.ui.effortScale,
        timeZone,
      });
      const folder = new Directory(Paths.cache, "export");
      folder.create({ idempotent: true, intermediates: true });
      const file = new File(folder, "cinnabar-sessions.csv");
      file.create({ overwrite: true });
      file.write(csv);
      if (!(await isAvailableAsync())) {
        toast.show({ variant: "danger", label: t("settings__export_failed") });
        return;
      }
      await shareAsync(file.uri, {
        mimeType: "text/csv",
        UTI: "public.comma-separated-values-text",
        dialogTitle: t("settings__export_title"),
      });
    } catch {
      toast.show({ variant: "danger", label: t("settings__export_failed") });
    } finally {
      setPending(false);
    }
  }, [database, pending, preferences, t, toast]);

  return { run, pending, ready: database !== null };
}
