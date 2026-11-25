import type { AbstractPowerSyncDatabase } from "@powersync/common";
import {
  loadRangesSchema,
  unavailableEquipmentSchema,
  type Equipment,
  type LoadRange,
} from "@workspace/shared";
import { z } from "zod";

import { readPreferencesRow } from "../../preferences";
import {
  EQUIPMENT_SQL,
  EXERCISE_BARS_SQL,
  parseEquipment,
  parseExerciseBars,
  type EquipmentRow,
} from "../sessions/session-watch";

const THROTTLE_MS = 50;
const GYM_PAGE_SIZE = 50;
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

/** The lacking equipment as stored (JSON text); anything unreadable is "has everything". */
export function unavailableEquipmentOf(text: string | null): Equipment[] {
  if (text === null) return [];
  try {
    const parsed = unavailableEquipmentSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** One gym of the user, oldest first: the first is the default gym. */
export type GymRow = {
  id: string;
  name: string;
  createdAt: string;
  /** Equipment types this gym lacks; empty means it has all of them. */
  unavailableEquipment: Equipment[];
  /** The heaviest dumbbell in kilograms; null for no limit. */
  dumbbellMaxKg: number | null;
};

const GYM_COLUMNS = "id, name, unavailable_equipment, dumbbell_max_kg, created_at";
const gymSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    unavailable_equipment: z.string().nullable(),
    dumbbell_max_kg: z.number().nullable(),
    created_at: z.string(),
  }),
);
const gymRowOf = (row: z.infer<typeof gymSchema>[number]): GymRow => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  unavailableEquipment: unavailableEquipmentOf(row.unavailable_equipment),
  dumbbellMaxKg: row.dumbbell_max_kg,
});

/** Watches the user's gyms, oldest first. */
export function watchGyms(
  database: AbstractPowerSyncDatabase,
  handlers: { onGyms: (gyms: GymRow[]) => void; onError: (error: Error) => void },
): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  let reading = false;
  let pending = false;
  const read = async () => {
    pending = true;
    if (reading) return;
    reading = true;
    try {
      do {
        pending = false;
        const gyms = await database.readTransaction(async (tx) => {
          const rows: GymRow[] = [];
          let cursor: GymRow | undefined;
          do {
            const where = cursor ? "WHERE (created_at, id) > (?, ?)" : "";
            const page = gymSchema.parse(
              await tx.getAll(
                `SELECT ${GYM_COLUMNS} FROM gym ${where} ORDER BY created_at, id LIMIT ${GYM_PAGE_SIZE}`,
                cursor ? [cursor.createdAt, cursor.id] : [],
              ),
            );
            for (const row of page) rows.push(gymRowOf(row));
            cursor = page.length === GYM_PAGE_SIZE ? rows.at(-1) : undefined;
          } while (cursor && !signal.aborted);
          return rows;
        });
        if (!pending && !signal.aborted) handlers.onGyms(gyms);
      } while (pending && !signal.aborted);
    } catch {
      if (!signal.aborted) handlers.onError(new Error("The local gyms could not be read"));
    } finally {
      reading = false;
    }
  };
  database.onChangeWithCallback(
    { onChange: () => void read() },
    { signal, tables: ["gym"], throttleMs: THROTTLE_MS },
  );
  void read();
  return () => controller.abort();
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

/**
 * The exercise settings of one gym. A gym that was deleted has none here, even while its rows
 * wait on the device for the server to take them.
 */
const SETTINGS_SQL = `SELECT exercise_id, load_ranges, setup_note FROM gym_exercise_setting
  WHERE gym_id = ? AND EXISTS (SELECT 1 FROM gym WHERE gym.id = gym_exercise_setting.gym_id)
  ORDER BY exercise_id LIMIT ${SETTINGS_LIMIT}`;

const parseSettings = (rows: readonly object[]): GymExerciseSettingRow[] =>
  settingSchema.parse(rows).map((row) => ({
    exerciseId: row.exercise_id,
    loadRanges: rangesOf(row.load_ranges),
    setupNote: row.setup_note,
  }));

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
    SETTINGS_SQL,
    [gymId],
    ["gym_exercise_setting", "gym"],
    parseSettings,
    { onResult: handlers.onSettings, onError: handlers.onError },
  );
}

/** What a gym says about loads: the gym, its exercise settings and kit, and each exercise's bar. */
export type GymLoadInputs = {
  /** The gym of the Session when it has one that exists, else the gym trained at; null with none. */
  gymId: string | null;
  /** The Session's own gym when it exists: whose Sessions the baselines come from. */
  sessionGymId: string | null;
  /** Rows with no gym belong to the oldest gym. */
  isDefaultGym: boolean;
  /** The heaviest dumbbell of the gym, in kilograms; null for no limit. */
  dumbbellMaxKg: number | null;
  /** The equipment types the gym lacks. */
  unavailableEquipment: Equipment[];
  settings: GymExerciseSettingRow[];
  kit: EquipmentRow[];
  bars: ReadonlyMap<string, string>;
};

/**
 * Reads the gym loads of one Session once, for work that has no screen to watch them (the live
 * notification). Same rule as the screens: the Session's gym when it exists, else the gym the user
 * trains at, else the oldest gym.
 */
export async function readGymLoadInputs(
  database: AbstractPowerSyncDatabase,
  sessionId: string,
): Promise<GymLoadInputs> {
  return database.readTransaction(async (tx) => {
    const gyms = gymSchema.parse(
      await tx.getAll(`SELECT ${GYM_COLUMNS} FROM gym ORDER BY created_at, id`),
    );
    const ids = new Set(gyms.map((row) => row.id));
    const [session] = z
      .array(z.object({ gym_id: z.string().nullable() }))
      .parse(await tx.getAll("SELECT gym_id FROM training_session WHERE id = ?", [sessionId]));
    const [prefs] = z
      .array(z.object({ ui: z.string() }))
      .parse(await tx.getAll("SELECT ui FROM user_preferences ORDER BY id DESC LIMIT 1"));
    const chosen = readPreferencesRow(prefs && { locale: null, timezone: null, ui: prefs.ui }).ui
      .activeGymId;
    const sessionGymId = session?.gym_id && ids.has(session.gym_id) ? session.gym_id : null;
    const activeGym = chosen && ids.has(chosen) ? chosen : null;
    const gymId = sessionGymId ?? activeGym ?? gyms[0]?.id ?? null;
    if (gymId === null) {
      return {
        gymId,
        sessionGymId,
        isDefaultGym: false,
        dumbbellMaxKg: null,
        unavailableEquipment: [],
        settings: [],
        kit: [],
        bars: new Map(),
      };
    }
    const chosenGym = gyms.find((row) => row.id === gymId);
    const isDefaultGym = gymId === gyms[0]?.id;
    return {
      gymId,
      sessionGymId,
      isDefaultGym,
      dumbbellMaxKg: chosenGym?.dumbbell_max_kg ?? null,
      unavailableEquipment: unavailableEquipmentOf(chosenGym?.unavailable_equipment ?? null),
      settings: parseSettings(await tx.getAll(SETTINGS_SQL, [gymId])),
      kit: parseEquipment(await tx.getAll(EQUIPMENT_SQL, [gymId, isDefaultGym ? "1" : "0"])),
      bars: parseExerciseBars(await tx.getAll(EXERCISE_BARS_SQL)),
    };
  });
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
