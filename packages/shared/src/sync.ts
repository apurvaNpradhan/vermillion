import { z } from "zod";

import { sha256Hex } from "./sha256";

/**
 * The wire contract of local-first sync (ADR 0017, 0018, 0019): what the
 * client connector sends to `sync.upload`, what the server answers, and the
 * constants both sides share. Runtime-neutral; no platform APIs.
 */

/** Version of the upload contract this build speaks. Sent with every upload. */
export const SYNC_SCHEMA_VERSION = 1;
/**
 * Oldest version the server still accepts. Never raise it above a version
 * released within the last 90 days (the offline horizon, ADR 0019).
 */
export const SYNC_MIN_SCHEMA_VERSION = 1;

/** `aud` of the PowerSync token; `powersync/service.yaml` `client_auth.audience` must match. */
export const SYNC_JWT_AUDIENCE = "powersync";
/**
 * Token lifetime. Short, so a deleted session or banned user loses stream access
 * within this window; the connector renews before `expiresAt` (ADR 0017).
 */
export const SYNC_JWT_TTL_SECONDS = 300;
/** Signing keys rotate this often; retired keys stay in the JWKS for Better Auth's 30-day grace. */
export const SYNC_JWKS_ROTATION_SECONDS = 30 * 24 * 60 * 60;

/** Tombstones and upload receipts are kept this long (ADR 0019: 90-day horizon plus margin). */
export const SYNC_RETENTION_DAYS = 120;

/** Limits the server enforces before doing any work and the client mirrors on local writes. */
export const SYNC_LIMITS = {
  /** Operations in one client transaction. */
  maxOps: 100,
  /** Columns in one operation's `opData`. */
  maxFields: 32,
  /** Characters in a table or column name, and in a row id. */
  maxNameLength: 64,
  /** UTF-8 bytes of one string value. */
  maxValueBytes: 64 * 1024,
  /** UTF-8 bytes of the canonical JSON of all operations. */
  maxTransactionBytes: 512 * 1024,
} as const;

export const SYNC_OPERATIONS = ["PUT", "PATCH", "DELETE"] as const;

const syncValueSchema = z.union([z.string(), z.number().finite(), z.null()]);
type SyncValue = z.infer<typeof syncValueSchema>;

/** One local write, as PowerSync's `CrudEntry` reports it. */
export const syncOpSchema = z.object({
  op: z.enum(SYNC_OPERATIONS),
  table: z.string().min(1),
  id: z.string().min(1),
  /** Absent for DELETE; every column for PUT; only the changed columns for PATCH. */
  opData: z.record(z.string(), syncValueSchema).optional(),
});
export type SyncOp = z.infer<typeof syncOpSchema>;

/** Hex sha256 (64 lowercase characters). */
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * One client CRUD transaction. `(userId, installId, txId)` is the durable replay
 * identity; `digest` pins its content (ADR 0018). Counts and sizes are not
 * bounded here but by `checkSyncLimits`, so an oversize transaction gets a
 * durable "rejected" answer instead of a validation error.
 */
export const syncUploadRequestSchema = z.object({
  /** The account the writes were queued for (the Device owner). */
  userId: z.string().min(1),
  /** UUIDv7 made when the local database was created. */
  installId: z.uuid(),
  /** PowerSync `CrudTransaction.transactionId`. */
  txId: z.number().int().nonnegative(),
  schemaVersion: z.number().int().positive(),
  digest: digestSchema,
  ops: z.array(syncOpSchema).min(1),
});
export type SyncUploadRequest = z.infer<typeof syncUploadRequestSchema>;

/** Why one operation (or a whole transaction) is permanently refused. */
export const SYNC_REJECTION_CODES = [
  "SYNC_UNKNOWN_TABLE",
  "SYNC_INVALID_OP",
  "SYNC_LIMIT_EXCEEDED",
  "SYNC_ROW_NOT_FOUND",
  "SYNC_ROW_DELETED",
  "SYNC_ID_CONFLICT",
  "SYNC_CONSTRAINT_VIOLATION",
  // The exercise library (ADR 0034): a vertical's own refusals carry its name.
  "EXERCISE_CATALOG_READ_ONLY",
  "EXERCISE_DELETE_NOT_ALLOWED",
  "EXERCISE_LIMIT_REACHED",
  "EXERCISE_TYPE_LOCKED",
  // Training plans (ADR 0036).
  "TRAINING_PARENT_NOT_FOUND",
  "TRAINING_SLOT_PROGRAM_MISMATCH",
  "TRAINING_INVALID_SETS",
  "TRAINING_LIMIT_REACHED",
  // Sessions (ADR 0037, 0038).
  "RUN_NOT_FOUND",
  "RUN_PROGRAM_NOT_FOUND",
  "RUN_SLOT_PROGRAM_MISMATCH",
  "SESSION_PARENT_NOT_FOUND",
  "SESSION_SET_INVALID_FOR_TYPE",
  "SESSION_LIMIT_REACHED",
  "SESSION_DATE_OUT_OF_RANGE",
] as const;
export const syncFailureCodeSchema = z.enum(SYNC_REJECTION_CODES);
export type SyncFailureCode = z.infer<typeof syncFailureCodeSchema>;

/** The code every operation that did not fail itself gets when a sibling fails. */
export const SYNC_TRANSACTION_ROLLED_BACK = "SYNC_TRANSACTION_ROLLED_BACK";
export const syncOpCodeSchema = z.enum([...SYNC_REJECTION_CODES, SYNC_TRANSACTION_ROLLED_BACK]);
export type SyncOpCode = z.infer<typeof syncOpCodeSchema>;

/**
 * The upload result for a transaction the server decided on. Both outcomes are
 * durable: a retry of the same key and digest gets the same answer.
 *
 * - `applied`: every operation committed.
 * - `rejected`: nothing committed. `code` is the first failing operation's code
 *   and `failedIndex` its position; `ops[i]` is that code at `failedIndex` and
 *   `SYNC_TRANSACTION_ROLLED_BACK` elsewhere. A transaction-wide refusal (limits)
 *   has `failedIndex: null` and an empty `ops`: every operation gets `code`.
 */
export const syncUploadResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("applied") }),
  z.object({
    status: z.literal("rejected"),
    code: syncFailureCodeSchema,
    failedIndex: z.number().int().nonnegative().nullable(),
    ops: z.array(syncOpCodeSchema),
  }),
]);
export type SyncUploadResult = z.infer<typeof syncUploadResultSchema>;

/**
 * Refusals that are not a decision about the writes: the API answers with an
 * error whose `data` is this, and the client keeps the queue.
 *
 * - `SYNC_WRONG_ACCOUNT` (409): the session is another account; writes stay queued.
 * - `SYNC_REPLAY_MISMATCH` (409): same key, different digest.
 * - `SYNC_CLIENT_INCOMPATIBLE` (400): schema version outside the window; pause, keep
 *   writes, prompt for an update.
 * - `SYNC_INVALID_REQUEST` (400): the digest does not match the operations.
 * - `SYNC_RATE_LIMITED` (429): back off.
 * - `SYNC_TRANSIENT` (502): nothing was stored; retry.
 */
export const SYNC_ERROR_CODES = [
  "SYNC_WRONG_ACCOUNT",
  "SYNC_REPLAY_MISMATCH",
  "SYNC_CLIENT_INCOMPATIBLE",
  "SYNC_INVALID_REQUEST",
  "SYNC_RATE_LIMITED",
  "SYNC_TRANSIENT",
] as const;
export const syncErrorDataSchema = z.object({
  code: z.enum(SYNC_ERROR_CODES),
  /** Set with `SYNC_CLIENT_INCOMPATIBLE`. */
  minSchemaVersion: z.number().int().optional(),
  maxSchemaVersion: z.number().int().optional(),
});
export type SyncErrorData = z.infer<typeof syncErrorDataSchema>;

/** The answer of `sync.credentials`. */
export const syncCredentialsSchema = z.object({
  /** PowerSync service URL; never a build-time constant. */
  endpoint: z.url(),
  token: z.string().min(1),
  /** The authenticated account; compare with the Device owner before connecting. */
  userId: z.string().min(1),
  /** When the token expires (ISO 8601 UTC). */
  expiresAt: z.iso.datetime(),
});
export type SyncCredentials = z.infer<typeof syncCredentialsSchema>;

const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

const compareCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function canonicalOp(op: SyncOp): string {
  // Keys in code-unit order: id, op, opData, table.
  const parts = [`"id":${JSON.stringify(op.id)}`, `"op":${JSON.stringify(op.op)}`];
  if (op.opData !== undefined) {
    const data = Object.entries(op.opData)
      // Object.entries creates a fresh array; sort works on native runtimes without toSorted.
      .sort(([a], [b]) => compareCodeUnits(a, b))
      .map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value satisfies SyncValue)}`)
      .join(",");
    parts.push(`"opData":{${data}}`);
  }
  parts.push(`"table":${JSON.stringify(op.table)}`);
  return `{${parts.join(",")}}`;
}

/**
 * The canonical JSON of a transaction's operations: sorted keys at every level,
 * no whitespace. Equal operations give equal text on every platform.
 */
export function canonicalOpsJson(ops: readonly SyncOp[]): string {
  return `[${ops.map(canonicalOp).join(",")}]`;
}

/** The replay digest: sha256 of `canonicalOpsJson(ops)`, lowercase hex. */
export function computeOpsDigest(ops: readonly SyncOp[]): string {
  return sha256Hex(canonicalOpsJson(ops));
}

const stringValue = z.string();

/**
 * The first limit a transaction breaks, or null. The server runs this before
 * touching the database; clients run it on local writes. Cheap checks first.
 */
export function checkSyncLimits(ops: readonly SyncOp[]): { reason: string } | null {
  if (ops.length > SYNC_LIMITS.maxOps) return { reason: "operations" };
  for (const op of ops) {
    if (op.table.length > SYNC_LIMITS.maxNameLength || op.id.length > SYNC_LIMITS.maxNameLength) {
      return { reason: "name" };
    }
    const entries = Object.entries(op.opData ?? {});
    if (entries.length > SYNC_LIMITS.maxFields) return { reason: "fields" };
    for (const [key, value] of entries) {
      if (key.length > SYNC_LIMITS.maxNameLength) return { reason: "name" };
      const text = stringValue.safeParse(value);
      if (text.success && utf8Bytes(text.data) > SYNC_LIMITS.maxValueBytes) {
        return { reason: "value" };
      }
    }
  }
  if (utf8Bytes(canonicalOpsJson(ops)) > SYNC_LIMITS.maxTransactionBytes) {
    return { reason: "bytes" };
  }
  return null;
}

/** Whether the server accepts uploads from a client at this schema version. */
export function isSyncSchemaVersionSupported(version: number): boolean {
  return version >= SYNC_MIN_SCHEMA_VERSION && version <= SYNC_SCHEMA_VERSION;
}
