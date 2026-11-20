import { DatabaseSync } from "node:sqlite";

import type { CrudEntry, PowerSyncBackendConnector } from "@powersync/common";

import type { LifecycleDatabase } from "./lifecycle-controller";

type Param = string | number | null;

type FakeState = {
  connector: PowerSyncBackendConnector | undefined;
  connects: number;
  disconnects: number;
  clears: number;
  status: {
    connected: boolean;
    uploading: boolean;
    lastSyncedAt: Date | undefined;
    hasSynced: boolean;
  };
  watchers: Array<(rows: Array<Record<string, Param>>) => void>;
  completed: number[];
};

/**
 * A real SQLite file with the sync package's tables, shaped like the PowerSync database the
 * connector, lifecycle and exercise store use. PowerSync itself (the sync stream, the CRUD triggers)
 * is the platform boundary: tests queue CRUD transactions by hand.
 */
export function createFakeDatabase(options: { beforeComplete?: () => void } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  const createSchema = () =>
    sqlite.exec(`
      CREATE TABLE exercise (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, primary_muscle TEXT,
        secondary_muscles TEXT, primary_detail TEXT, secondary_detail TEXT, equipment TEXT,
        exercise_type TEXT, is_full_bodyweight INTEGER,
        rank INTEGER, search_terms TEXT, aka TEXT, instructions TEXT, video_key TEXT,
        thumbnail_key TEXT, image_media_id TEXT, retired_at TEXT, created_at TEXT);
      CREATE TABLE program (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, description TEXT,
        planned_weeks INTEGER, sessions_per_week INTEGER, cover_media_id TEXT, created_at TEXT, restore INTEGER);
      CREATE TABLE workout (id TEXT PRIMARY KEY, user_id TEXT, program_id TEXT, title TEXT,
        note TEXT, created_at TEXT, restore INTEGER);
      CREATE TABLE workout_exercise (id TEXT PRIMARY KEY, user_id TEXT, workout_id TEXT,
        exercise_id TEXT, position TEXT, rest_seconds INTEGER, note TEXT, superset_group TEXT,
        sets TEXT, created_at TEXT, restore INTEGER);
      CREATE TABLE program_run (id TEXT PRIMARY KEY, user_id TEXT, program_id TEXT,
        activated_at TEXT, started_at TEXT, finished_at TEXT, outcome TEXT, continued_at TEXT, created_at TEXT);
      CREATE TABLE program_slot (id TEXT PRIMARY KEY, user_id TEXT, program_id TEXT,
        workout_id TEXT, position TEXT, created_at TEXT, restore INTEGER);
      CREATE TABLE training_session (id TEXT PRIMARY KEY, user_id TEXT, workout_id TEXT, workout_structure TEXT,
        program_id TEXT, run_id TEXT, slot_id TEXT, cycle INTEGER, title TEXT,
        title_derived INTEGER, note TEXT, started_at TEXT, finished_at TEXT, duration_s INTEGER,
        device_id TEXT, rest_set_id TEXT, rest_started_at TEXT, rest_ends_at TEXT,
        created_at TEXT, restore INTEGER);
      CREATE TABLE session_exercise (id TEXT PRIMARY KEY, user_id TEXT, session_id TEXT,
        exercise_id TEXT, exercise_title TEXT, exercise_type TEXT,
        source_workout_exercise_id TEXT, position TEXT, rest_seconds INTEGER, note TEXT,
        superset_group TEXT, log_effort INTEGER, warmup_key TEXT, created_at TEXT, restore INTEGER);
      CREATE TABLE session_photo (id TEXT PRIMARY KEY, user_id TEXT, session_id TEXT, media_id TEXT, position REAL, created_at TEXT, restore INTEGER);
      CREATE TABLE session_set (id TEXT PRIMARY KEY, user_id TEXT, session_exercise_id TEXT,
        position TEXT, kind TEXT, weight_kg REAL, reps INTEGER, duration_s INTEGER,
        distance_m REAL, floors INTEGER, steps INTEGER, rpe REAL, completed_at TEXT,
        timer_started_at TEXT, target TEXT, generated_warmup INTEGER, created_at TEXT, restore INTEGER);
      CREATE TABLE gym_equipment (id TEXT PRIMARY KEY, user_id TEXT, kind TEXT, weight_kg REAL,
        unit TEXT, label TEXT, count INTEGER, enabled INTEGER, created_at TEXT, restore INTEGER);
      CREATE TABLE exercise_setting (id TEXT PRIMARY KEY, user_id TEXT, exercise_id TEXT,
        bar_id TEXT, log_effort INTEGER, progression_per_set INTEGER, auto_warmups INTEGER, note TEXT, created_at TEXT, restore INTEGER);
      CREATE TABLE media (id TEXT PRIMARY KEY, user_id TEXT, kind TEXT, mime TEXT, width INTEGER,
        height INTEGER, bytes INTEGER, thumb_bytes INTEGER, created_at TEXT);
      CREATE TABLE user_preferences (id TEXT PRIMARY KEY, user_id TEXT, locale TEXT, timezone TEXT,
        ui TEXT, created_at TEXT, patch TEXT);
      CREATE TABLE progress_photo (id TEXT PRIMARY KEY, user_id TEXT, media_id TEXT, pose TEXT,
        taken_at TEXT, local_date TEXT, created_at TEXT);
      CREATE TABLE body_measurement (id TEXT PRIMARY KEY, user_id TEXT, metric TEXT, value REAL,
        measured_at TEXT, local_date TEXT, source TEXT, created_at TEXT, restore INTEGER);
      CREATE TABLE attachments (id TEXT PRIMARY KEY, filename TEXT, local_uri TEXT, timestamp INTEGER,
        size INTEGER, media_type TEXT, state INTEGER, has_synced INTEGER, meta_data TEXT);
      CREATE TABLE device_owner (id TEXT PRIMARY KEY, user_id TEXT, created_at TEXT);
      CREATE TABLE install_meta (id TEXT PRIMARY KEY, install_id TEXT, created_at TEXT);
      CREATE TABLE rejected_writes (id TEXT PRIMARY KEY, tx_id TEXT, op_ordinal INTEGER,
        schema_version INTEGER, table_name TEXT, row_id TEXT, op TEXT, code TEXT, payload TEXT,
        payload_truncated INTEGER, created_at TEXT);
    `);
  createSchema();

  const transactions: Array<{ transactionId: number | undefined; crud: CrudEntry[] }> = [];
  const state: FakeState = {
    connector: undefined,
    connects: 0,
    disconnects: 0,
    clears: 0,
    status: { connected: false, uploading: false, lastSyncedAt: undefined, hasSynced: false },
    watchers: [],
    completed: [],
  };

  const tx = {
    getOptional: async (sql: string, params: Param[] = []) =>
      sqlite.prepare(sql).get(...params) ?? null,
    getAll: async (sql: string, params: Param[] = []) => sqlite.prepare(sql).all(...params),
    get: async (sql: string, params: Param[] = []) => sqlite.prepare(sql).get(...params),
    execute: async (sql: string, params: Param[] = []) => {
      const result = sqlite.prepare(sql).run(...params);
      return { ...result, rowsAffected: Number(result.changes) };
    },
    // What the Drizzle driver reads: column values in select order.
    executeRaw: async (sql: string, params: Param[] = []) => ({
      rawRows: sqlite
        .prepare(sql)
        .all(...params)
        .map((row) => Object.values(row)),
    }),
  };

  let depth = 0;
  const database = {
    ...tx,
    // A real SQLite transaction: a throw rolls every write back, like PowerSync's. Nested calls
    // join the outer one.
    writeTransaction: async <T>(fn: (t: typeof tx) => Promise<T>) => {
      if (depth > 0) return fn(tx);
      sqlite.exec("BEGIN");
      depth += 1;
      try {
        const result = await fn(tx);
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      } finally {
        depth -= 1;
      }
    },
    readLock: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
    writeLock: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
    getNextCrudTransaction: async () => {
      const next = transactions[0];
      if (!next) return null;
      return {
        ...next,
        complete: async () => {
          options.beforeComplete?.();
          transactions.shift();
          if (next.transactionId !== undefined) state.completed.push(next.transactionId);
        },
      };
    },
    getUploadQueueStats: async () => ({
      count: transactions.reduce((total, item) => total + item.crud.length, 0),
    }),
    get currentStatus() {
      return {
        ...state.status,
        statusForPriority: (priority: number) => ({ priority, hasSynced: state.status.hasSynced }),
      };
    },
    registerListener: () => () => undefined,
    watchWithCallback: (
      _sql: string,
      _params: Param[],
      handler: { onResult: (result: { array: Array<Record<string, Param>> }) => void },
    ) => {
      state.watchers.push((rows) => handler.onResult({ array: rows }));
    },
    connect: async (connector: PowerSyncBackendConnector) => {
      state.connector = connector;
      state.connects += 1;
    },
    disconnect: async () => {
      state.disconnects += 1;
    },
    disconnectAndClear: async () => {
      state.clears += 1;
      for (const table of [
        "exercise",
        "program",
        "workout",
        "workout_exercise",
        "program_slot",
        "training_session",
        "session_exercise",
        "session_set",
        "gym_equipment",
        "exercise_setting",
        "media",
        "progress_photo",
        "user_preferences",
        "body_measurement",
        "attachments",
        "device_owner",
        "install_meta",
        "rejected_writes",
      ]) {
        sqlite.exec(`DELETE FROM ${table}`);
      }
      transactions.length = 0;
    },
  };

  return {
    database: asDouble<LifecycleDatabase>(
      // SAFETY: the double implements every method the code under test calls.
      database as never,
    ),
    sqlite,
    state,
    queue(crud: CrudEntry[], transactionId: number | undefined = crud[0]?.clientId) {
      transactions.push({ transactionId, crud });
      for (const emit of state.watchers) emit([{ count: transactions.length }]);
    },
    pendingTransactions: () => transactions.length,
  };
}

let clientId = 0;

/** `never` converts to any type, so the one assertion at each call site carries the SAFETY note. */
function asDouble<T>(double: never): T {
  return double;
}

/** A CRUD entry as PowerSync reports it. */
export function crudEntry(
  op: "PUT" | "PATCH" | "DELETE",
  id: string,
  opData?: Record<string, Param>,
  table = "exercise",
): CrudEntry {
  clientId += 1;
  return asDouble<CrudEntry>(
    // SAFETY: the double carries the CrudEntry fields the connector reads.
    { clientId, op, table, id, opData, transactionId: undefined } as never,
  );
}
