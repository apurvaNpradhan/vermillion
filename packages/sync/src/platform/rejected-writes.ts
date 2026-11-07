import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { z } from "zod";

export const REJECTED_WRITES_LIMIT = 50;

export type RejectedWritesDatabase = Pick<
  AbstractPowerSyncDatabase,
  "getOptional" | "watchWithCallback" | "writeTransaction"
>;

const rowSchema = z.object({
  id: z.string(),
  table_name: z.string(),
  row_id: z.string(),
  op: z.enum(["PUT", "PATCH", "DELETE"]),
  code: z.string(),
  payload: z.string(),
  payload_truncated: z.number(),
  created_at: z.string(),
});

/** A refused write kept for review (ADR 0018). Held until the user retries or discards it. */
export type RejectedWrite = {
  id: string;
  table: string;
  rowId: string;
  op: "PUT" | "PATCH" | "DELETE";
  /** A stored rejection code; map it with `rejectionMessageKey`, never show it raw. */
  code: string;
  /** JSON of the op's data. Not valid JSON when `truncated`. Never log it. */
  payload: string;
  truncated: boolean;
  createdAt: string;
};

export function toRejectedWrite(row: z.infer<typeof rowSchema>): RejectedWrite {
  return {
    id: row.id,
    table: row.table_name,
    rowId: row.row_id,
    op: row.op,
    code: row.code,
    payload: row.payload,
    truncated: row.payload_truncated !== 0,
    createdAt: row.created_at,
  };
}

/** Bounded live read of the oldest rejected writes; `total` is the full count. */
export function watchRejectedWrites(
  database: Pick<RejectedWritesDatabase, "watchWithCallback">,
  handlers: {
    onResult: (result: { writes: RejectedWrite[]; hasMore: boolean }) => void;
    onError: (error: Error) => void;
  },
  limit = REJECTED_WRITES_LIMIT,
): () => void {
  const controller = new AbortController();
  database.watchWithCallback(
    `SELECT id, table_name, row_id, op, code, payload, payload_truncated, created_at
     FROM rejected_writes ORDER BY created_at, id LIMIT ?`,
    [limit + 1],
    {
      onResult: (result) => {
        const parsed = z.array(rowSchema).safeParse(result.array);
        if (!parsed.success) {
          handlers.onError(new Error("Rejected writes could not be read"));
          return;
        }
        handlers.onResult({
          writes: parsed.data.slice(0, limit).map(toRejectedWrite),
          hasMore: parsed.data.length > limit,
        });
      },
      onError: handlers.onError,
    },
    { signal: controller.signal, tables: ["rejected_writes"] },
  );
  return () => controller.abort();
}

export async function readRejectedWrite(
  database: Pick<RejectedWritesDatabase, "getOptional">,
  id: string,
): Promise<RejectedWrite | null> {
  const row = await database.getOptional(
    `SELECT id, table_name, row_id, op, code, payload, payload_truncated, created_at
     FROM rejected_writes WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  return toRejectedWrite(rowSchema.parse(row));
}

/** Explicit, user-confirmed removal. Retention is otherwise unlimited (ADR 0018). */
export async function discardRejectedWrite(
  database: Pick<RejectedWritesDatabase, "writeTransaction">,
  id: string,
): Promise<void> {
  await database.writeTransaction((tx) =>
    tx.execute("DELETE FROM rejected_writes WHERE id = ?", [id]),
  );
}
