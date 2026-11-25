import { csvCell } from "@workspace/shared";
import type { BackupPageWriter, BodyExportRow } from "@workspace/sync";

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

type BodyCsvKind = "weights" | "measurements";

export const BODY_CSV_HEADERS = {
  weights: "Date,Measured at,Weight (kg),Source",
  measurements: "Date,Measured at,Metric,Value (cm),Source",
};

const number = (value: number) => String(Number(value.toFixed(4)));

/** Returns only the data lines for this export, in the order read from SQLite. */
export function bodyCsvPage(kind: BodyCsvKind, rows: readonly BodyExportRow[]): string {
  const lines: string[] = [];
  for (const row of rows) {
    if ((row.metric === "weight") !== (kind === "weights")) continue;
    const cells = [csvCell(row.localDate), csvCell(row.measuredAt)];
    if (kind === "measurements") cells.push(csvCell(row.metric));
    cells.push(number(row.value), csvCell(row.source));
    lines.push(cells.join(",") + "\r\n");
  }
  return lines.join("");
}

/** Writes a versioned JSON document one table page at a time. */
export async function writeBackupJson(
  { app, appVersion, exportedAt }: { app: string; appVersion: string; exportedAt: Date },
  visitPages: (writePage: BackupPageWriter) => Promise<void>,
  write: (chunk: string) => Promise<void>,
): Promise<void> {
  const header = JSON.stringify({
    app: app.toLowerCase(),
    kind: "record",
    schemaVersion: RECORD_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    appVersion,
  });
  await write(`${header.slice(0, -1)},"tables":{`);
  let table: string | null = null;
  let hasRows = false;
  await visitPages(async (name, rows) => {
    if (name !== table) {
      await write(`${table === null ? "" : "],"}${JSON.stringify(name)}:[`);
      table = name;
      hasRows = false;
    }
    if (rows.length === 0) return;
    await write((hasRows ? "," : "") + rows.map((row) => JSON.stringify(row)).join(","));
    hasRows = true;
  });
  await write(table === null ? "}}" : "]}}");
}
