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
 * connector, lifecycle and notes store use. PowerSync itself (the sync stream, the CRUD triggers)
 * is the platform boundary: tests queue CRUD transactions by hand.
 */
export function createFakeDatabase(options: { beforeComplete?: () => void } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  const createSchema = () =>
    sqlite.exec(`
      CREATE TABLE notes (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, body TEXT,
        created_at TEXT, updated_at TEXT, deleted_at TEXT);
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
    execute: async (sql: string, params: Param[] = []) => sqlite.prepare(sql).run(...params),
  };

  const database = {
    ...tx,
    writeTransaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
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
      return state.status;
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
      for (const table of ["notes", "device_owner", "install_meta", "rejected_writes"]) {
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
  table = "notes",
): CrudEntry {
  clientId += 1;
  return asDouble<CrudEntry>(
    // SAFETY: the double carries the CrudEntry fields the connector reads.
    { clientId, op, table, id, opData, transactionId: undefined } as never,
  );
}
