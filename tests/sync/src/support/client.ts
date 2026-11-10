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
import { uploadColumns as appUploadColumns } from "@workspace/sync";
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

/** The client half of the synced tables: the columns the streams deliver. */
export const schema = new Schema({
  // Catalog rows (`user_id` null) and the owner's Custom exercises arrive in this one table.
  exercise: new Table({
    user_id: column.text,
    title: column.text,
    primary_muscle: column.text,
    secondary_muscles: column.text,
    equipment: column.text,
    exercise_type: column.text,
    is_full_bodyweight: column.integer,
    rank: column.integer,
    search_terms: column.text,
    aka: column.text,
    instructions: column.text,
    video_key: column.text,
    thumbnail_key: column.text,
    retired_at: column.text,
    created_at: column.text,
  }),
});

/**
 * The columns an upload may carry per synced table: the app's own map, so the seam tests send what
 * the real connector sends (the upload handler is strict and refuses columns it does not own,
 * ADR 0019). The exercise table keeps its own list here.
 */
const uploadColumns = (table: string): readonly string[] => {
  if (table === "exercise") {
    return [
      "title",
      "primary_muscle",
      "secondary_muscles",
      "equipment",
      "exercise_type",
      "is_full_bodyweight",
      "instructions",
      "retired_at",
    ];
  }
  return [...(appUploadColumns.get(table) ?? [])];
};

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
  /** Open this file again, as an app restarted after being killed does (the files are kept). */
  existing?: { directory: string; filename: string },
) {
  const directory = existing?.directory ?? mkdtempSync(join(tmpdir(), "vermillion-sync-"));
  const filename = existing?.filename ?? `client-${randomUUID()}.db`;
  const database = new PowerSyncDatabase({
    schema: localSchema,
    database: { dbFilename: filename, dbLocation: directory },
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

  const customIds = async () =>
    (
      await database.getAll<{ id: string }>(
        "SELECT id FROM exercise WHERE user_id IS NOT NULL ORDER BY id",
      )
    ).map((r) => r.id);

  return {
    database,
    /** Where the database file is, for `existing` of a restart. */
    storage: { directory, filename },
    transport,
    records,
    api,
    async connect() {
      await database.connect(connector, { retryDelayMs: 200, crudUploadThrottleMs: 50 });
      await database.waitForFirstSync();
    },
    disconnect: () => database.disconnect(),
    /**
     * A Custom exercise written locally, as the app does: plain SQL, uploaded as a PUT. An empty
     * title is allowed here so tests can send what the server must refuse.
     */
    createExercise: (
      id: string,
      userId: string,
      title: string,
      instructions: string | null = null,
    ) =>
      database.execute(
        `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
           exercise_type, is_full_bodyweight, instructions, created_at)
         VALUES (?, ?, ?, 'chest', '["triceps"]', 'dumbbell', 'weight_reps', 0, ?, ?)`,
        [id, userId, title, instructions, new Date().toISOString()],
      ),
    /** Changes only the given fields, uploaded as a PATCH. */
    updateExercise: (
      id: string,
      fields: { title?: string; instructions?: string; retired_at?: string },
    ) =>
      database.execute(
        `UPDATE exercise SET title = coalesce(?, title), instructions = coalesce(?, instructions),
           retired_at = coalesce(?, retired_at) WHERE id = ?`,
        [fields.title ?? null, fields.instructions ?? null, fields.retired_at ?? null, id],
      ),
    deleteExercise: (id: string) => database.execute("DELETE FROM exercise WHERE id = ?", [id]),
    exercise: (id: string) =>
      database.getOptional<{
        id: string;
        user_id: string | null;
        title: string;
        instructions: string | null;
        retired_at: string | null;
        created_at: string | null;
      }>("SELECT * FROM exercise WHERE id = ?", [id]),
    /** Ids of the Custom exercises on this device (the catalog is not listed). */
    customIds,
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
    /** Closes the database; the files are removed unless `keepFiles` (a restart opens them again). */
    async close(keepFiles = false) {
      await database.close();
      if (!keepFiles) rmSync(directory, { recursive: true, force: true });
    },
  };
}

export type SyncClient = Awaited<ReturnType<typeof createClient>>;
