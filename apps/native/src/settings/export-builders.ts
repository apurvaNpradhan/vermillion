import { csvCell } from "@workspace/shared";
import type { BackupTables, BodyExportRow } from "@workspace/sync";

/** Bumped when the backup file's layout changes in a way a reader must know about. */
export const RECORD_SCHEMA_VERSION = 1;

export type RecordKind = "backup" | "history" | "weights" | "measurements";

/** The local calendar day of `now` in `timeZone`, as `YYYY-MM-DD`. */
export function recordDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The file name of a record export: `sigil-record-2026-11-24.json`, and for the CSV parts
 * `sigil-record-weights-2026-11-24.csv`.
 */
export function recordFileName(app: string, kind: RecordKind, date: string): string {
  const prefix = `${app.toLowerCase()}-record`;
  if (kind === "backup") return `${prefix}-${date}.json`;
  return `${prefix}-${kind}-${date}.csv`;
}

const lines = (rows: string[][]) => rows.map((row) => row.join(",")).join("\r\n") + "\r\n";
const number = (value: number) => String(Number(value.toFixed(4)));

/** One line per weigh-in, oldest first. Weight is in kilograms. */
export function weightsCsv(rows: readonly BodyExportRow[]): string {
  return lines([
    ["Date", "Measured at", "Weight (kg)", "Source"],
    ...rows.flatMap((row) =>
      row.metric === "weight"
        ? [
            [
              csvCell(row.localDate),
              csvCell(row.measuredAt),
              number(row.value),
              csvCell(row.source),
            ],
          ]
        : [],
    ),
  ]);
}

/** One line per body measurement (every metric but weight), oldest first. Values are in cm. */
export function measurementsCsv(rows: readonly BodyExportRow[]): string {
  return lines([
    ["Date", "Measured at", "Metric", "Value (cm)", "Source"],
    ...rows.flatMap((row) =>
      row.metric === "weight"
        ? []
        : [
            [
              csvCell(row.localDate),
              csvCell(row.measuredAt),
              csvCell(row.metric),
              number(row.value),
              csvCell(row.source),
            ],
          ],
    ),
  ]);
}

export const hasWeights = (rows: readonly BodyExportRow[]) =>
  rows.some((row) => row.metric === "weight");
export const hasMeasurements = (rows: readonly BodyExportRow[]) =>
  rows.some((row) => row.metric !== "weight");

/**
 * Everything the user owns on this device as one JSON document: a `schemaVersion` for readers,
 * when it was exported, and each table's rows as stored (ids, times, kilograms and centimetres).
 * Media files are not inside it, only their rows. There is no restore yet.
 */
export function backupJson({
  app,
  appVersion,
  exportedAt,
  tables,
}: {
  app: string;
  appVersion: string;
  exportedAt: Date;
  tables: BackupTables;
}): string {
  return JSON.stringify(
    {
      app: app.toLowerCase(),
      kind: "record",
      schemaVersion: RECORD_SCHEMA_VERSION,
      exportedAt: exportedAt.toISOString(),
      appVersion,
      tables,
    },
    null,
    1,
  );
}
