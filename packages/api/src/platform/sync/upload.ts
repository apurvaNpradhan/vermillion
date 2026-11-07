import type { Database, DbExecutor } from "@workspace/db";
import { log } from "@workspace/logger";
import {
  checkSyncLimits,
  computeOpsDigest,
  isSyncSchemaVersionSupported,
  SYNC_MIN_SCHEMA_VERSION,
  SYNC_SCHEMA_VERSION,
  SYNC_TRANSACTION_ROLLED_BACK,
  syncUploadResultSchema,
  type SyncErrorData,
  type SyncFailureCode,
  type SyncUploadRequest,
  type SyncUploadResult,
} from "@workspace/shared";
import { and, eq } from "drizzle-orm";

import { classifyDbError } from "./classify-db-error";
import { SyncRejection } from "./handler";
import { findSyncHandler } from "./registry";
import { syncUploadReceipts } from "./tables";

/** A refusal that is not a verdict on the writes (wrong account, replay mismatch, ...). */
export class SyncRefusal extends Error {
  readonly data: SyncErrorData;
  constructor(data: SyncErrorData) {
    super(data.code);
    this.name = "SyncRefusal";
    this.data = data;
  }
}

/** The first failing operation inside a transaction that is being rolled back. */
class OpFailure extends Error {
  readonly index: number;
  readonly code: SyncFailureCode;
  constructor(index: number, code: SyncFailureCode) {
    super(code);
    this.name = "OpFailure";
    this.index = index;
    this.code = code;
  }
}

async function applyOps(tx: DbExecutor, userId: string, request: SyncUploadRequest) {
  for (const [index, op] of request.ops.entries()) {
    const handler = findSyncHandler(op.table);
    if (!handler) throw new OpFailure(index, "SYNC_UNKNOWN_TABLE");
    try {
      await handler.apply(tx, userId, op);
    } catch (error) {
      if (error instanceof SyncRejection) throw new OpFailure(index, error.code);
      const code = error instanceof Error ? classifyDbError(error) : null;
      if (code) throw new OpFailure(index, code);
      throw error;
    }
  }
}

/** Runs the operations in a savepoint; the first failure undoes all of them and is reported. */
async function runOps(
  tx: DbExecutor,
  userId: string,
  request: SyncUploadRequest,
): Promise<SyncUploadResult> {
  try {
    await tx.transaction((savepoint) => applyOps(savepoint, userId, request));
    return { status: "applied" };
  } catch (error) {
    if (!(error instanceof OpFailure)) throw error;
    return {
      status: "rejected",
      code: error.code,
      failedIndex: error.index,
      ops: request.ops.map((_, index) =>
        index === error.index ? error.code : SYNC_TRANSACTION_ROLLED_BACK,
      ),
    };
  }
}

/**
 * Applies one client transaction (ADR 0018): one Postgres transaction holds the
 * receipt claim, the writes and the stored outcome. The same replay key and
 * digest return the stored outcome without applying anything again; the same
 * key with another digest is refused. Order of checks: account, schema window,
 * limits, digest; the database is touched only after all of them.
 */
export async function applyUpload(
  db: Database,
  userId: string,
  request: SyncUploadRequest,
): Promise<SyncUploadResult> {
  if (request.userId !== userId) throw new SyncRefusal({ code: "SYNC_WRONG_ACCOUNT" });
  if (!isSyncSchemaVersionSupported(request.schemaVersion)) {
    throw new SyncRefusal({
      code: "SYNC_CLIENT_INCOMPATIBLE",
      minSchemaVersion: SYNC_MIN_SCHEMA_VERSION,
      maxSchemaVersion: SYNC_SCHEMA_VERSION,
    });
  }
  const exceeded = checkSyncLimits(request.ops);
  if (exceeded) {
    log.info({ action: "sync.upload", status: "rejected", reason: exceeded.reason });
    return { status: "rejected", code: "SYNC_LIMIT_EXCEEDED", failedIndex: null, ops: [] };
  }
  if (computeOpsDigest(request.ops) !== request.digest) {
    throw new SyncRefusal({ code: "SYNC_INVALID_REQUEST" });
  }

  const key = and(
    eq(syncUploadReceipts.userId, userId),
    eq(syncUploadReceipts.installId, request.installId),
    eq(syncUploadReceipts.txId, request.txId),
  );
  try {
    const result = await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(syncUploadReceipts)
        .values({
          userId,
          installId: request.installId,
          txId: request.txId,
          digest: request.digest,
        })
        .onConflictDoNothing()
        .returning({ txId: syncUploadReceipts.txId });

      if (claimed.length === 0) {
        // A concurrent duplicate waited on the primary key until the first one committed.
        const [existing] = await tx.select().from(syncUploadReceipts).where(key).limit(1);
        if (!existing) throw new Error("Receipt disappeared after a conflict");
        if (existing.digest !== request.digest) {
          throw new SyncRefusal({ code: "SYNC_REPLAY_MISMATCH" });
        }
        return { replayed: true, outcome: syncUploadResultSchema.parse(existing.outcome) };
      }

      const outcome = await runOps(tx, userId, request);
      await tx.update(syncUploadReceipts).set({ outcome }).where(key);
      return { replayed: false, outcome };
    });
    log.info({
      action: "sync.upload",
      status: result.outcome.status,
      replayed: result.replayed,
      opCount: request.ops.length,
    });
    return result.outcome;
  } catch (error) {
    if (error instanceof SyncRefusal) throw error;
    // Only the error's name is logged: driver messages can quote row values.
    log.warn({
      action: "sync.upload.transient",
      errorName: error instanceof Error ? error.name : "unknown",
    });
    throw new SyncRefusal({ code: "SYNC_TRANSIENT" });
  }
}
