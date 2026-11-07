import { notesSyncHandler } from "../../notes/index";
import type { SyncTableHandler } from "./handler";

/**
 * The table allowlist of `sync.upload`: a synced vertical adds its handler here.
 * An upload naming any other table is rejected.
 */
export const syncTableHandlers: readonly SyncTableHandler[] = [notesSyncHandler];

export function findSyncHandler(table: string) {
  return syncTableHandlers.find((handler) => handler.table === table);
}
