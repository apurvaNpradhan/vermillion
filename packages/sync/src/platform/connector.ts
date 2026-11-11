import type { AbstractPowerSyncDatabase, CrudEntry, PowerSyncCredentials } from "@powersync/common";
import {
  SYNC_SCHEMA_VERSION,
  SYNC_TRANSACTION_ROLLED_BACK,
  checkSyncLimits,
  computeOpsDigest,
  syncOpSchema,
  type SyncOp,
  type SyncUploadRequest,
  type SyncUploadResult,
} from "@workspace/shared";

import { readDeviceOwner } from "./device-owner";
import { readInstallId } from "./install-meta";
import { boundPayload } from "./rejected-payload";
import { classifyFailure, type FailureKind, type SyncTransport } from "./transport";

/** Why the connector stopped uploading; the lifecycle turns it into a state (ADR 0021). */
export type ConnectorSignal = "unauthorized" | "wrong-account" | "update-required";

/** The slice of the database the connector uses. */
export type ConnectorDatabase = Pick<
  AbstractPowerSyncDatabase,
  "getNextCrudTransaction" | "getOptional" | "writeTransaction"
>;

export type ConnectorOptions = {
  /** The database the connector belongs to: its Device owner and install id gate everything. */
  database: ConnectorDatabase;
  transport: SyncTransport;
  /** Told once per failure that needs the lifecycle's attention. */
  onSignal: (signal: ConnectorSignal) => void;
  /**
   * Columns each table's upload may carry. Local-only bookkeeping columns (`user_id`, timestamps)
   * are written locally but the server owns them, so they never go on the wire; a table not listed
   * is sent as is and the server refuses it by name.
   */
  uploadColumns: ReadonlyMap<string, ReadonlySet<string>>;
  /** Reported `expiresAt` is this much earlier than the token's, so the SDK renews in time. */
  renewalMarginMs?: number;
};

/** Renew when about this much of the five minute token is left (ADR 0017). */
export const DEFAULT_RENEWAL_MARGIN_MS = 60_000;

/** Thrown to the SDK so it keeps the queue and retries later. Carries no row data. */
export class SyncUploadError extends Error {
  readonly kind: FailureKind | "no-owner";
  constructor(kind: FailureKind | "no-owner") {
    super(`Sync failed: ${kind}`);
    this.name = "SyncUploadError";
    this.kind = kind;
  }
}

type KeptOp = { entry: CrudEntry; ordinal: number; op: SyncOp };

function toWireOp(entry: CrudEntry, columns: ReadonlySet<string> | undefined): SyncOp | null {
  const data = entry.opData
    ? Object.fromEntries(
        Object.entries(entry.opData).filter(([column]) => columns?.has(column) ?? true),
      )
    : undefined;
  // A PATCH that changed only server-owned columns has nothing to say.
  if (entry.op === "PATCH" && data && Object.keys(data).length === 0) return null;
  const parsed = syncOpSchema.safeParse({
    op: entry.op,
    table: entry.table,
    id: entry.id,
    ...(entry.op === "DELETE" ? {} : { opData: data ?? {} }),
  });
  if (!parsed.success) throw new LocalRejection("SYNC_INVALID_OP");
  return parsed.data;
}

/** A transaction this device itself knows the server would refuse. */
class LocalRejection extends Error {
  readonly code: "SYNC_INVALID_OP" | "SYNC_LIMIT_EXCEEDED";
  constructor(code: "SYNC_INVALID_OP" | "SYNC_LIMIT_EXCEEDED") {
    super(code);
    this.code = code;
  }
}

/**
 * The PowerSync connector (ADR 0017, 0018, 0021).
 *
 * Credentials come from `sync.credentials` and are used only when they belong to the Device owner.
 * Each upload is one CRUD transaction: success completes it; a permanent rejection is stored in
 * `rejected_writes` and then completed; every other outcome throws and leaves the queue untouched.
 * Nothing here ever clears local data.
 */
export function createConnector({
  database,
  transport,
  onSignal,
  uploadColumns,
  renewalMarginMs = DEFAULT_RENEWAL_MARGIN_MS,
}: ConnectorOptions) {
  /** Maps a failed call to a signal and the error the SDK retries on. */
  function fail(error: Error | null | undefined): never {
    const kind = classifyFailure(error);
    console.log("UPLOADDBG", kind, String(error), JSON.stringify(error)?.slice(0, 800));
    if (kind === "unauthorized" || kind === "wrong-account") onSignal(kind);
    if (kind === "incompatible") onSignal("update-required");
    throw new SyncUploadError(kind);
  }

  return {
    async fetchCredentials(): Promise<PowerSyncCredentials> {
      const credentials = await transport
        .credentials()
        .catch((error: Error | null) => fail(error ?? undefined));
      const owner = await readDeviceOwner(database);
      if (!owner) throw new SyncUploadError("no-owner");
      // The session cookie can belong to someone else. Their stream must never fill this database.
      if (credentials.userId !== owner) {
        onSignal("wrong-account");
        throw new SyncUploadError("wrong-account");
      }
      return {
        endpoint: credentials.endpoint,
        token: credentials.token,
        expiresAt: new Date(Date.parse(credentials.expiresAt) - renewalMarginMs),
      };
    },
    async uploadData(): Promise<void> {
      const transaction = await database.getNextCrudTransaction();
      if (!transaction) return;
      const owner = await readDeviceOwner(database);
      if (!owner) throw new SyncUploadError("no-owner");
      const installId = await readInstallId(database);
      if (!installId) throw new SyncUploadError("no-owner");

      const txId = transaction.transactionId ?? transaction.crud[0]?.clientId ?? 0;

      let kept: KeptOp[];
      try {
        kept = transaction.crud.flatMap((entry, ordinal) => {
          const op = toWireOp(entry, uploadColumns.get(entry.table));
          return op ? [{ entry, ordinal, op }] : [];
        });
        if (kept.length > 0 && checkSyncLimits(kept.map((item) => item.op))) {
          throw new LocalRejection("SYNC_LIMIT_EXCEEDED");
        }
      } catch (error) {
        if (!(error instanceof LocalRejection)) throw error;
        // The server would refuse this durably; saying so locally saves sending it.
        await storeRejected(
          database,
          txId,
          transaction.crud,
          transaction.crud.map(() => error.code),
        );
        await transaction.complete();
        return;
      }

      if (kept.length === 0) {
        await transaction.complete();
        return;
      }

      const ops = kept.map((item) => item.op);
      const request: SyncUploadRequest = {
        userId: owner,
        installId,
        txId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        digest: computeOpsDigest(ops),
        ops,
      };
      let result: SyncUploadResult;
      try {
        result = await transport.upload(request);
      } catch (error) {
        return fail(error instanceof Error ? error : null);
      }

      if (result.status === "rejected") {
        const codes = transaction.crud.map((): string => SYNC_TRANSACTION_ROLLED_BACK);
        for (const [index, item] of kept.entries()) {
          codes[item.ordinal] = result.ops[index] ?? result.code;
        }
        await storeRejected(database, txId, transaction.crud, codes);
      }
      // Applied, or rejected and now stored: either way the transaction is settled.
      await transaction.complete();
    },
  };
}

/**
 * Durably records each operation of a refused transaction, deduplicated by its identity so a
 * retry after a lost `complete()` adds nothing. Payloads are bounded and never logged.
 */
async function storeRejected(
  database: ConnectorDatabase,
  txId: number,
  entries: readonly CrudEntry[],
  codes: readonly string[],
): Promise<void> {
  const now = new Date().toISOString();
  await database.writeTransaction(async (tx) => {
    for (const [index, entry] of entries.entries()) {
      const id = `${txId}:${index}`;
      const known = await tx.getOptional<{ id: string }>(
        "SELECT id FROM rejected_writes WHERE id = ?",
        [id],
      );
      if (known) continue;
      const { payload, truncated } = boundPayload(entry.opData);
      await tx.execute(
        `INSERT INTO rejected_writes
           (id, tx_id, op_ordinal, schema_version, table_name, row_id, op, code, payload,
            payload_truncated, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          String(txId),
          index,
          SYNC_SCHEMA_VERSION,
          entry.table,
          entry.id,
          entry.op,
          codes[index] ?? SYNC_TRANSACTION_ROLLED_BACK,
          payload,
          truncated ? 1 : 0,
          now,
        ],
      );
    }
  });
}
