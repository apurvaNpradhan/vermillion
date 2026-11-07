import { readDeviceOwner } from "@workspace/sync";

import { openLocalData } from "@/platform/local-database";
import { deviceStorage } from "@/platform/storage";

const KEY = "sync.deletion-requested-for";

/**
 * Called when the user asks for deletion. The emailed link is opened later, often signed out, so
 * remember whose deletion it is; the server-confirmed landing then wipes only that account's
 * local copy.
 */
export function rememberDeletionRequest(userId: string) {
  deviceStorage.set(KEY, userId);
}

/** The server confirmed a deletion: wipe the local copy if it belongs to the deleted account. */
export async function confirmAccountDeleted() {
  const userId = deviceStorage.get(KEY);
  if (!userId) return;
  const local = await openLocalData();
  if (local.status !== "ready") return;
  await local.lifecycle.accountDeleted(userId);
  // Only forget the request once the copy is gone (or was never ours).
  if ((await readDeviceOwner(local.database)) !== userId) deviceStorage.set(KEY, null);
}
