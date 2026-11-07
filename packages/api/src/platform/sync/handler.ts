import type { DbExecutor } from "@workspace/db";
import type { SyncFailureCode, SyncOp } from "@workspace/shared";

/** A permanent refusal of one operation. Throw it from a table handler. */
export class SyncRejection extends Error {
  readonly code: SyncFailureCode;
  constructor(code: SyncFailureCode) {
    super(code);
    this.name = "SyncRejection";
    this.code = code;
  }
}

/**
 * A vertical's side of `sync.upload` for one synced table. `apply` translates a
 * client operation into the vertical's operations on the given transaction; it
 * validates the op's fields itself and never trusts a client `user_id`.
 */
export type SyncTableHandler = {
  /** The table's name in the client schema and in uploads. */
  table: string;
  apply(db: DbExecutor, userId: string, op: SyncOp): Promise<void>;
  /** Hard-deletes tombstones older than `olderThan`; returns how many. */
  purgeTombstones(db: DbExecutor, olderThan: Date): Promise<number>;
};
