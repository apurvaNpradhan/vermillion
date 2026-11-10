import type { SyncFailureCode } from "@workspace/shared";
import { z } from "zod";

import { SyncRejection } from "../platform/sync/handler";
import type { Ownership } from "./operations/lookup";

const rowId = z.uuid();
/** A new row must carry a UUIDv7 made on the client. */
export const newRowId = z.uuidv7();

export const now = () => new Date();

/** A new or restored row would pass `limit` live rows. Needs the user's lock held. */
export function assertRoom(
  live: number,
  adding: number,
  limit: number,
  code: SyncFailureCode = "TRAINING_LIMIT_REACHED",
) {
  if (live + adding > limit) throw new SyncRejection(code);
}

export function invalid(): never {
  throw new SyncRejection("SYNC_INVALID_OP");
}

/** The parsed data, or a permanent refusal of the operation. */
export function accept<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success) return invalid();
  return result.data;
}

/** The id, validated; a new row must also carry a UUIDv7 made on the client. */
export function idOf(value: string): string {
  const id = rowId.safeParse(value);
  if (!id.success) return invalid();
  return id.data;
}

/** What a PATCH or DELETE may do to a row: only the writer's own rows exist for them. */
export function ownRow<Row>(found: Ownership<Row>): Row {
  if (found.kind !== "own") throw new SyncRejection("SYNC_ROW_NOT_FOUND");
  return found.row;
}

export function liveRow<Row extends { deletedAt: Date | null }>(found: Ownership<Row>): Row {
  const row = ownRow(found);
  if (row.deletedAt !== null) throw new SyncRejection("SYNC_ROW_DELETED");
  return row;
}

/**
 * The explicit restore marker a client sends with a PUT to undo its own delete (ADR 0019: delete
 * wins over ordinary edits, restore is a separate explicit action). The local row is gone after a
 * delete, so no PATCH can be queued; Undo re-inserts the rows with the marker set. The marker is a
 * local-only column that is never synced down.
 */
export const restoreMarker = z
  .union([z.literal(0), z.literal(1)])
  .optional()
  .transform((value) => value === 1);

/**
 * Create, replace a live row, or restore one's own deleted row. A plain PUT of a deleted row is
 * refused, so a stale offline write cannot resurrect it; a restore of a row that does not exist
 * (purged) is refused too.
 */
export function checkPut<Row extends { deletedAt: Date | null }>(
  found: Ownership<Row>,
  restore: boolean,
) {
  if (found.kind === "absent" && restore) throw new SyncRejection("SYNC_ROW_NOT_FOUND");
  if (found.kind === "own" && found.row.deletedAt !== null && !restore) {
    throw new SyncRejection("SYNC_ROW_DELETED");
  }
}
