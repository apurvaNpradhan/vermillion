import type { AbstractPowerSyncDatabase } from "@powersync/common";

/** Why a platform cannot give the app durable local storage. */
export type StorageUnavailableReason =
  /** The browser lacks OPFS, a worker or the APIs the chosen VFS needs. */
  | "unsupported"
  /** The browser refused storage (permission, private mode). */
  | "denied"
  /** Opening the database failed for another reason. */
  | "open-failed";

export type OpenDatabaseResult =
  | { status: "ready"; database: AbstractPowerSyncDatabase }
  | { status: "unavailable"; reason: StorageUnavailableReason };

/**
 * Platform-neutral factory. Each app supplies one (`apps/native/src/platform`). There is no in-memory fallback: when durable storage is missing the
 * result says so and the app shows an explicit state.
 */
export interface DatabaseFactory {
  open(): Promise<OpenDatabaseResult>;
}
