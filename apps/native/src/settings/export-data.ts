import { createStrongCsvPageFormatter, STRONG_CSV_HEADER } from "@workspace/shared";
import { visitBackupPages, visitBodyExportPages, visitSessionExportPages } from "@workspace/sync";
import { File, FileMode, type Directory } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";

import { appConfig } from "@/platform/app-config";
import { createExportDirectory, releaseExportDirectory } from "@/platform/export-files";
import { useTranslation } from "@/platform/i18n";
import { deviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useLocalData, useSyncValue } from "@/sync";

import {
  BODY_CSV_HEADERS,
  bodyCsvPage,
  recordDate,
  recordFileName,
  writeBackupJson,
  type RecordKind,
} from "./export-builders";

type LocalDatabase = Extract<
  NonNullable<ReturnType<typeof useLocalData>>,
  { status: "ready" }
>["database"];

const CSV = { mimeType: "text/csv", UTI: "public.comma-separated-values-text" };
const JSON_FILE = { mimeType: "application/json", UTI: "public.json" };

async function writeRecord({
  kind,
  database,
  owner,
  file,
  now,
  timeZone,
  signal,
}: {
  kind: RecordKind;
  database: LocalDatabase;
  owner: string;
  file: File;
  now: Date;
  timeZone: string;
  signal: AbortSignal;
}): Promise<boolean> {
  const handle = file.open(FileMode.WriteOnly);
  const encoder = new TextEncoder();
  const write = (text: string) => {
    if (signal.aborted) throw new Error("Export cancelled");
    return handle.writeBytes(encoder.encode(text));
  };

  try {
    if (kind === "backup") {
      await writeBackupJson(
        { app: appConfig.displayName, appVersion: appConfig.version, exportedAt: now },
        (writePage) => visitBackupPages(database, owner, writePage),
        write,
      );
      return true;
    }

    let hasRows = false;
    const header = kind === "history" ? STRONG_CSV_HEADER.join(",") : BODY_CSV_HEADERS[kind];
    const writeRows = async (text: string) => {
      if (signal.aborted) throw new Error("Export cancelled");
      if (text === "") return;
      if (!hasRows) await write(header + "\r\n");
      await write(text);
      hasRows = true;
    };
    if (kind === "history") {
      const formatPage = createStrongCsvPageFormatter({ timeZone });
      await visitSessionExportPages(database, owner, (rows) => writeRows(formatPage(rows)));
    } else {
      await visitBodyExportPages(database, owner, (rows) => writeRows(bodyCsvPage(kind, rows)));
    }
    return hasRows;
  } finally {
    handle.close();
  }
}

/** Writes and shares one export at a time from the device owner's local snapshot. */
export function useExportRecord() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const hasSynced = useSyncValue((snapshot) => snapshot?.hasSynced === true);
  const owner = useSyncValue((snapshot) => {
    const phase = snapshot?.phase;
    return phase && "owner" in phase && phase.kind !== "blocked" ? phase.owner : null;
  });
  const [pending, setPending] = useState<RecordKind | null>(null);
  const activeExport = useRef<AbortController | null>(null);
  const database = local?.status === "ready" ? local.database : null;
  useEffect(() => () => activeExport.current?.abort(), [database, owner]);

  const run = useCallback(
    async (kind: RecordKind) => {
      if (!database || !hasSynced || owner === null || activeExport.current) return;
      const task = new AbortController();
      activeExport.current = task;
      setPending(kind);
      let directory: Directory | undefined;
      let shared = false;
      try {
        const now = new Date();
        const timeZone = deviceTimeZone();
        directory = createExportDirectory(task);
        if (!(await isAvailableAsync())) throw new Error("Sharing is unavailable");
        if (task.signal.aborted) return;
        const file = new File(
          directory,
          recordFileName(appConfig.displayName, kind, recordDate(now, timeZone)),
        );
        file.create();
        const hasRows = await writeRecord({
          kind,
          database,
          owner,
          file,
          now,
          timeZone,
          signal: task.signal,
        });
        if (task.signal.aborted) return;
        if (!hasRows) {
          toast.show({ label: t("settings__export_empty") });
          return;
        }
        await shareAsync(file.uri, {
          ...(kind === "backup" ? JSON_FILE : CSV),
          dialogTitle: t("settings__record_title"),
        });
        shared = true;
      } catch {
        if (!task.signal.aborted)
          toast.show({ variant: "danger", label: t("settings__export_failed") });
      } finally {
        if (directory) releaseExportDirectory(directory, task, shared);
        activeExport.current = null;
        setPending(null);
      }
    },
    [database, hasSynced, owner, t, toast],
  );

  return { run, pending, ready: database !== null && hasSynced && owner !== null, hasSynced };
}
