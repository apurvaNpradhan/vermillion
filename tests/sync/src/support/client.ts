import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import {
  column,
  Schema,
  Table,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from "@powersync/common";
import { PowerSyncDatabase } from "@powersync/node";
import type { AppRouterClient } from "@workspace/api/client";
import {
  computeOpsDigest,
  SYNC_SCHEMA_VERSION,
  syncErrorDataSchema,
  syncOpSchema,
  type SyncOp,
  type SyncUploadResult,
} from "@workspace/shared";
import { expect, vi } from "vitest";

import { services } from "../prerequisites";
import type { TestUser } from "./users";

/** The client half of the notes table: the columns the stream delivers. */
export const schema = new Schema({
  notes: new Table({
    title: column.text,
    body: column.text,
    created_at: column.text,
    updated_at: column.text,
  }),
});

/**
 * Columns a client may upload per table. `created_at` and `updated_at` are server-managed:
 * the upload handler is strict and refuses columns it does not own (ADR 0019).
 */
const uploadColumns = (table: string): readonly string[] =>
  table === "notes" ? ["title", "body"] : [];

export type TransportFaults = {
  /** Upload calls whose response is lost after the server committed (the ack-loss case). */
  loseResponses: number;
  /** The upload contract version this "build" speaks; lower or raise it to play an old client. */
  schemaVersion: number;
};

/** A transaction outcome the connector saw, for tests to assert on. */
export type UploadRecord =
  | { kind: "result"; txId: number; result: SyncUploadResult }
  | { kind: "error"; txId: number; code: string | undefined };

/**
 * Test-local connector implementing the phase 4 contract: credentials from
 * `sync.credentials`, one `sync.upload` per CRUD transaction with the replay identity
 * `(userId, installId, txId)` and a digest, and a permanent answer (applied or rejected)
 * completes the transaction. Any other failure is thrown so PowerSync retries it.
 */
export function createConnector(options: {
  api: AppRouterClient;
  userId: string;
  installId: string;
  faults: TransportFaults;
  records: UploadRecord[];
}): PowerSyncBackendConnector {
  const { api, userId, installId, faults, records } = options;
  return {
    async fetchCredentials(): Promise<PowerSyncCredentials> {
      const credentials = await api.sync.credentials();
      if (credentials.userId !== userId) throw new Error("the session is another account");
      return {
        endpoint: credentials.endpoint,
        token: credentials.token,
        expiresAt: new Date(credentials.expiresAt),
      };
    },

    async uploadData(database: AbstractPowerSyncDatabase) {
      for (;;) {
        const transaction = await database.getNextCrudTransaction();
        if (!transaction) return;
        const txId = transaction.transactionId;
        if (txId === undefined) throw new Error("PowerSync gave a transaction without an id");
        const ops: SyncOp[] = transaction.crud.map((entry) => {
          const allowed = uploadColumns(entry.table);
          const opData = entry.opData
            ? Object.fromEntries(Object.entries(entry.opData).filter(([k]) => allowed.includes(k)))
            : undefined;
          return syncOpSchema.parse({ op: entry.op, table: entry.table, id: entry.id, opData });
        });
        try {
          const result = await api.sync.upload({
            userId,
            installId,
            txId,
            schemaVersion: faults.schemaVersion,
            digest: computeOpsDigest(ops),
            ops,
          });
          if (faults.loseResponses > 0) {
            faults.loseResponses -= 1;
            records.push({ kind: "error", txId, code: "RESPONSE_LOST" });
            throw new TypeError("fetch failed");
          }
          records.push({ kind: "result", txId, result });
          await transaction.complete();
        } catch (error) {
          if (!(error instanceof TypeError && error.message === "fetch failed")) {
            const data =
              error instanceof ORPCError ? syncErrorDataSchema.safeParse(error.data) : null;
            records.push({ kind: "error", txId, code: data?.success ? data.data.code : undefined });
          }
          throw error;
        }
      }
    },
  };
}

/** A phone without the phone: a Node SQLite PowerSync database for one account. */
export async function createClient(
  user: TestUser,
  faults: Partial<TransportFaults> = {},
  localSchema: Schema = schema,
) {
  const directory = mkdtempSync(join(tmpdir(), "vermillion-sync-"));
  const database = new PowerSyncDatabase({
    schema: localSchema,
    database: { dbFilename: `client-${randomUUID()}.db`, dbLocation: directory },
  });
  const api: AppRouterClient = createORPCClient(
    new RPCLink({
      origin: new URL(services.apiUrl).origin,
      url: "/rpc",
      headers: { cookie: user.cookie, origin: services.appOrigin },
    }),
  );
  const records: UploadRecord[] = [];
  const transport: TransportFaults = {
    loseResponses: faults.loseResponses ?? 0,
    schemaVersion: faults.schemaVersion ?? SYNC_SCHEMA_VERSION,
  };
  const connector = createConnector({
    api,
    userId: user.userId,
    installId: randomUUID(),
    faults: transport,
    records,
  });
  await database.init();

  const noteIds = async () =>
    (await database.getAll<{ id: string }>("SELECT id FROM notes ORDER BY id")).map((r) => r.id);

  return {
    database,
    transport,
    records,
    api,
    async connect() {
      await database.connect(connector, { retryDelayMs: 200, crudUploadThrottleMs: 50 });
      await database.waitForFirstSync();
    },
    disconnect: () => database.disconnect(),
    /** A local write, as the app makes it: plain SQL on the client's SQLite. */
    async createNote(id: string, title: string, body = "") {
      await database.execute("INSERT INTO notes (id, title, body) VALUES (?, ?, ?)", [
        id,
        title,
        body,
      ]);
    },
    updateNote: (id: string, fields: { title?: string; body?: string }) =>
      database.execute(
        "UPDATE notes SET title = coalesce(?, title), body = coalesce(?, body) WHERE id = ?",
        [fields.title ?? null, fields.body ?? null, id],
      ),
    deleteNote: (id: string) => database.execute("DELETE FROM notes WHERE id = ?", [id]),
    note: (id: string) =>
      database.getOptional<{
        id: string;
        title: string;
        body: string;
        created_at: string | null;
        updated_at: string | null;
      }>("SELECT * FROM notes WHERE id = ?", [id]),
    noteIds,
    /** Settled outcomes by transaction id; a replay of the same transaction overwrites itself. */
    outcomes: () =>
      new Map(records.flatMap((r) => (r.kind === "result" ? [[r.txId, r.result] as const] : []))),
    queued: async () => (await database.getUploadQueueStats()).count,
    /** Resolves once every queued write has been uploaded and acknowledged. */
    uploaded: () =>
      vi.waitFor(
        async () => expect(await database.getUploadQueueStats().then((s) => s.count)).toBe(0),
        { timeout: 30_000 },
      ),
    async close() {
      await database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export type SyncClient = Awaited<ReturnType<typeof createClient>>;
