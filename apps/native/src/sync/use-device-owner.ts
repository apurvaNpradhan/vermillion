import { phaseOwner } from "@workspace/sync";

import { useLocalData } from "./use-local-data";
import { useSyncValue } from "./use-sync-status";

/**
 * Whether this device holds a user's data (ADR 0021), live: the root guard lets an owner into the
 * app without a session, and stops once the data is wiped. `isPending` until the local database
 * has answered.
 */
export function useDeviceOwner() {
  const local = useLocalData();
  const status = local === null ? "loading" : local.status;
  const starting = useSyncValue((snapshot) => snapshot?.phase.kind === "starting");
  const hasOwner = useSyncValue(
    (snapshot) => snapshot !== null && phaseOwner(snapshot.phase) !== null,
  );
  return { isPending: status === "loading" || (status === "ready" && starting), hasOwner };
}
