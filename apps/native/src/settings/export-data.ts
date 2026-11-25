import { strongCsv } from "@workspace/shared";
import { readBackupTables, readBodyExportRows, readSessionExportRows } from "@workspace/sync";
import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { deviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useLocalData } from "@/sync";

import {
  backupJson,
  hasMeasurements,
  hasWeights,
  measurementsCsv,
  recordDate,
  recordFileName,
  weightsCsv,
  type RecordKind,
} from "./export-builders";

type LocalDatabase = Extract<
  NonNullable<ReturnType<typeof useLocalData>>,
  { status: "ready" }
>["database"];

type Built = { text: string; mimeType: string; uti: string } | null;

const CSV = { mimeType: "text/csv", uti: "public.comma-separated-values-text" };

/** Reads the local database and builds one file; null when there is nothing to export. */
async function build(kind: RecordKind, database: LocalDatabase, now: Date): Promise<Built> {
  switch (kind) {
    case "history": {
      const rows = await readSessionExportRows(database);
      return rows.length === 0
        ? null
        : { text: strongCsv(rows, { timeZone: deviceTimeZone() }), ...CSV };
    }
    case "weights": {
      const rows = await readBodyExportRows(database);
      return hasWeights(rows) ? { text: weightsCsv(rows), ...CSV } : null;
    }
    case "measurements": {
      const rows = await readBodyExportRows(database);
      return hasMeasurements(rows) ? { text: measurementsCsv(rows), ...CSV } : null;
    }
    case "backup":
      return {
        text: backupJson({
          app: appConfig.displayName,
          appVersion: appConfig.version,
          exportedAt: now,
          tables: await readBackupTables(database),
        }),
        mimeType: "application/json",
        uti: "public.json",
      };
  }
}

/**
 * Shares "your record" from the local database through the share sheet: the history as a
 * Strong-format CSV, weights and measurements as a CSV each, and a full JSON backup. Files are
 * named `sigil-record-…` with the day; the next export replaces the cached file of the same name.
 */
export function useExportRecord() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const [pending, setPending] = useState<RecordKind | null>(null);
  const activeExport = useRef<AbortController | null>(null);
  const database = local?.status === "ready" ? local.database : null;
  useEffect(() => () => activeExport.current?.abort(), [database]);

  const run = useCallback(
    async (kind: RecordKind) => {
      if (!database || activeExport.current) return;
      const task = new AbortController();
      activeExport.current = task;
      setPending(kind);
      try {
        const now = new Date();
        const built = await build(kind, database, now);
        if (task.signal.aborted) return;
        if (built === null) {
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
        const file = new File(
          folder,
          recordFileName(appConfig.displayName, kind, recordDate(now, deviceTimeZone())),
        );
        file.create({ overwrite: true });
        file.write(built.text);
        await shareAsync(file.uri, {
          mimeType: built.mimeType,
          UTI: built.uti,
          dialogTitle: t("settings__record_title"),
        });
      } catch {
        if (!task.signal.aborted)
          toast.show({ variant: "danger", label: t("settings__export_failed") });
      } finally {
        activeExport.current = null;
        setPending(null);
      }
    },
    [database, t, toast],
  );

  return { run, pending, ready: database !== null };
}
