import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { BODY_METRICS } from "@workspace/shared";
import { z } from "zod";

/** Rows one export read pulls; the export pages through everything. */
const EXPORT_PAGE = 2000;

const rowSchema = z.object({
  metric: z.enum(BODY_METRICS),
  value: z.number(),
  measured_at: z.string(),
  local_date: z.string(),
  source: z.enum(["manual", "health"]),
});

export type BodyExportRow = {
  metric: (typeof BODY_METRICS)[number];
  /** Kilograms for `weight`, centimetres for every other metric. */
  value: number;
  /** ISO instant of the measurement. */
  measuredAt: string;
  /** The calendar day the user recorded it on. */
  localDate: string;
  source: "manual" | "health";
};

/** Every weigh-in and body measurement, oldest first, from one SQLite snapshot. */
export function readBodyExportRows(
  database: Pick<AbstractPowerSyncDatabase, "readTransaction">,
): Promise<BodyExportRow[]> {
  return database.readTransaction(async (tx) => {
    const rows: BodyExportRow[] = [];
    for (let offset = 0; ; offset += EXPORT_PAGE) {
      const page = z.array(rowSchema).parse(
        await tx.getAll(
          `SELECT metric, value, measured_at, local_date, source FROM body_measurement
           ORDER BY local_date, julianday(measured_at), id LIMIT ? OFFSET ?`,
          [EXPORT_PAGE, offset],
        ),
      );
      for (const row of page)
        rows.push({
          metric: row.metric,
          value: row.value,
          measuredAt: row.measured_at,
          localDate: row.local_date,
          source: row.source,
        });
      if (page.length < EXPORT_PAGE) return rows;
    }
  });
}
