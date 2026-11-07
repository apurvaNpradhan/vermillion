import { phaseOwner } from "@workspace/sync";

import { useSyncStatus } from "./use-sync-status";

/**
 * Whether this device holds a user's data (ADR 0021), live: the root guard lets an owner into the
 * app without a session, and stops once the data is wiped. `isPending` until the local database
 * has answered.
 */
export function useDeviceOwner() {
  const { status, snapshot } = useSyncStatus();
  const isPending =
    status === "loading" || (status === "ready" && snapshot?.phase.kind === "starting");
  return { isPending, hasOwner: snapshot !== null && phaseOwner(snapshot.phase) !== null };
}
