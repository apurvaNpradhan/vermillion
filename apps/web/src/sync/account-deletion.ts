import { readDeviceOwner } from "@workspace/sync";

import { openLocalData } from "@/platform/powersync";

const KEY = "vermillion.deletion-requested-for";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Called when the user asks for deletion. The emailed link is opened later, often signed out, so
 * remember whose deletion it is; the server-confirmed landing page then wipes only that
 * account's local copy.
 */
export function rememberDeletionRequest(userId: string) {
  storage()?.setItem(KEY, userId);
}

/** The deletion landing page: wipe the local copy if it belongs to the account that was deleted. */
export async function confirmAccountDeleted() {
  const store = storage();
  const userId = store?.getItem(KEY);
  if (!store || !userId) return;
  const local = await openLocalData();
  if (local.status !== "ready") return;
  await local.lifecycle.accountDeleted(userId);
  // Only forget the request once the copy is gone (or was never ours).
  if ((await readDeviceOwner(local.database)) !== userId) store.removeItem(KEY);
}
