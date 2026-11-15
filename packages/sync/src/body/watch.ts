import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { BODY_METRICS, type BodyMetric } from "@workspace/shared";
import { z } from "zod";
const rowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  metric: z.enum(BODY_METRICS),
  value: z.number(),
  measured_at: z.string(),
  local_date: z.string(),
  source: z.enum(["manual", "health"]),
  created_at: z.string(),
  restore: z.number().nullable().default(null),
});
export type WatchedMeasurement = z.infer<typeof rowSchema>;
type Handlers = { onEntries: (rows: WatchedMeasurement[]) => void; onError: () => void };
function watch(db: AbstractPowerSyncDatabase, sql: string, params: string[], handlers: Handlers) {
  const controller = new AbortController();
  db.watchWithCallback(
    sql,
    params,
    {
      onResult: (result) => {
        const parsed = z.array(rowSchema).safeParse(result.array);
        if (parsed.success) handlers.onEntries(parsed.data);
        else handlers.onError();
      },
      onError: handlers.onError,
    },
    { signal: controller.signal, tables: ["body_measurement"] },
  );
  return () => controller.abort();
}
export function watchMetric(
  db: AbstractPowerSyncDatabase,
  metric: BodyMetric,
  handlers: Handlers,
  from = "0000-01-01",
) {
  const pageSize = 500;
  const pages: WatchedMeasurement[][] = [];
  const stops: (() => void)[] = [];
  const keys: string[] = [];
  let active = true;
  const open = (page: number, after?: WatchedMeasurement) => {
    const key = after ? `${after.local_date}|${after.measured_at}|${after.id}` : "first";
    if (keys[page] === key) return;
    stops.splice(page).forEach((stop) => stop());
    keys.splice(page);
    pages.splice(page);
    keys[page] = key;
    stops[page] = watch(
      db,
      `SELECT * FROM body_measurement WHERE metric = ? AND local_date >= ? ${after ? "AND (local_date, julianday(measured_at), id) > (?, julianday(?), ?)" : ""} ORDER BY local_date, julianday(measured_at), id LIMIT 501`,
      after ? [metric, from, after.local_date, after.measured_at, after.id] : [metric, from],
      {
        onError: handlers.onError,
        onEntries: (rows) => {
          if (!active || keys[page] !== key) return;
          pages[page] = rows.slice(0, pageSize);
          const last = pages[page]?.at(-1);
          if (rows.length > pageSize && last) open(page + 1, last);
          else {
            stops.splice(page + 1).forEach((stop) => stop());
            keys.splice(page + 1);
            pages.splice(page + 1);
          }
          handlers.onEntries(pages.flat());
        },
      },
    );
  };
  open(0);
  return () => {
    active = false;
    stops.forEach((stop) => stop());
  };
}
export function watchLatestByMetric(db: AbstractPowerSyncDatabase, handlers: Handlers) {
  return watch(
    db,
    "SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY metric ORDER BY local_date DESC, julianday(measured_at) DESC, id DESC) AS rank FROM body_measurement) WHERE rank = 1 LIMIT 14",
    [],
    handlers,
  );
}
export function watchWeighInDays(db: AbstractPowerSyncDatabase, from: string, handlers: Handlers) {
  return watchMetric(db, "weight", handlers, from);
}
