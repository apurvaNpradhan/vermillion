import type { SyncFailureCode } from "@workspace/shared";
import { z } from "zod";

const sqlStateSchema = z.object({ code: z.string().length(5) });

/** The Postgres SQLSTATE of an error, looking through Drizzle's query-error wrapper. */
function sqlState(error: Error): string | undefined {
  let current: Error | undefined = error;
  for (let depth = 0; current && depth < 4; depth++) {
    const state = sqlStateSchema.safeParse(current);
    if (state.success) return state.data.code;
    current = current.cause instanceof Error ? current.cause : undefined;
  }
  return undefined;
}

/**
 * Known, permanent database refusals of a client's data. Anything else (a lost
 * connection, a deadlock, a bug) is not a verdict on the writes and stays
 * transient so the client retries.
 */
export function classifyDbError(error: Error): SyncFailureCode | null {
  const state = sqlState(error);
  if (!state) return null;
  // unique_violation: the id is taken (by another user, or by a concurrent create).
  if (state === "23505") return "SYNC_ID_CONFLICT";
  // check_violation, not_null_violation, foreign_key_violation.
  if (state === "23514" || state === "23502" || state === "23503") {
    return "SYNC_CONSTRAINT_VIOLATION";
  }
  // string_data_right_truncation, invalid byte sequence, untranslatable character (NUL).
  if (state === "22001" || state === "22021" || state === "22P05" || state === "22P02") {
    return "SYNC_INVALID_OP";
  }
  return null;
}
