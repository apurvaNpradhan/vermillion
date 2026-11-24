import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { loadRangesSchema, type LoadRange } from "@workspace/shared";
import { z } from "zod";

const THROTTLE_MS = 50;
const GYMS_LIMIT = 50;
const SETTINGS_LIMIT = 500;

/** Runs a query and again whenever one of `tables` changes; a result is parsed or reported. */
function watchRows<T>(
  database: AbstractPowerSyncDatabase,
  sql: string,
  params: string[],
  tables: string[],
  parse: (rows: readonly object[]) => T,
  handlers: { onResult: (value: T) => void; onError: (error: Error) => void },
): () => void {
  const controller = new AbortController();
  let last = "";
  database.watchWithCallback(
    sql,
    params,
    {
      onResult: (result) => {
        if (controller.signal.aborted) return;
        const key = JSON.stringify(result.array);
        if (key === last) return;
        last = key;
        try {
          handlers.onResult(parse(result.array));
        } catch {
          handlers.onError(new Error("The local gyms could not be read"));
        }
      },
      onError: (error) => {
        if (!controller.signal.aborted) handlers.onError(error);
      },
    },
    { signal: controller.signal, tables, throttleMs: THROTTLE_MS },
  );
  return () => controller.abort();
}

/** One gym of the user, oldest first: the first is the default gym. */
export type GymRow = { id: string; name: string; createdAt: string };

const gymSchema = z.array(z.object({ id: z.string(), name: z.string(), created_at: z.string() }));

/** Watches the user's gyms, oldest first. */
export function watchGyms(
  database: AbstractPowerSyncDatabase,
  handlers: { onGyms: (gyms: GymRow[]) => void; onError: (error: Error) => void },
): () => void {
  return watchRows(
    database,
    `SELECT id, name, created_at FROM gym ORDER BY created_at, id LIMIT ${GYMS_LIMIT}`,
    [],
    ["gym"],
    (rows) =>
      gymSchema
        .parse(rows)
        .map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at })),
    { onResult: handlers.onGyms, onError: handlers.onError },
  );
}

/** What a gym says about one exercise. */
export type GymExerciseSettingRow = {
  exerciseId: string;
  loadRanges: LoadRange[];
  setupNote: string | null;
};

const settingSchema = z.array(
  z.object({
    exercise_id: z.string(),
    load_ranges: z.string().nullable(),
    setup_note: z.string().nullable(),
  }),
);

/** Ranges as stored (JSON text); anything unreadable is no ranges, never an error. */
function rangesOf(text: string | null): LoadRange[] {
  if (text === null) return [];
  try {
    const parsed = loadRangesSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Watches every exercise setting of one gym (a gym has few: only exercises the user set up). */
export function watchGymExerciseSettings(
  database: AbstractPowerSyncDatabase,
  gymId: string,
  handlers: {
    onSettings: (settings: GymExerciseSettingRow[]) => void;
    onError: (error: Error) => void;
  },
): () => void {
  return watchRows(
    database,
    `SELECT exercise_id, load_ranges, setup_note FROM gym_exercise_setting
      WHERE gym_id = ? ORDER BY exercise_id LIMIT ${SETTINGS_LIMIT}`,
    [gymId],
    ["gym_exercise_setting"],
    (rows) =>
      settingSchema.parse(rows).map((row) => ({
        exerciseId: row.exercise_id,
        loadRanges: rangesOf(row.load_ranges),
        setupNote: row.setup_note,
      })),
    { onResult: handlers.onSettings, onError: handlers.onError },
  );
}

/** The gym of one Session (null for any gym); a gym that is gone reads as none. */
export function watchSessionGym(
  database: AbstractPowerSyncDatabase,
  sessionId: string,
  handlers: { onGym: (gymId: string | null) => void; onError: (error: Error) => void },
): () => void {
  return watchRows(
    database,
    `SELECT g.id AS id FROM training_session s JOIN gym g ON g.id = s.gym_id WHERE s.id = ? LIMIT 1`,
    [sessionId],
    ["training_session", "gym"],
    (rows) => z.array(z.object({ id: z.string() })).parse(rows)[0]?.id ?? null,
    { onResult: handlers.onGym, onError: handlers.onError },
  );
}
