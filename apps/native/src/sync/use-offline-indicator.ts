import { useEffect, useState } from "react";

import { OFFLINE_GRACE_MS, createDelayedFlag, isDisconnected } from "./connectivity";
import { useSyncValue } from "./use-sync-status";

/**
 * Whether to show the Offline pill: true once sync has been disconnected for the grace period
 * (no flash on a brief drop), false as soon as it reconnects. The source is the PowerSync
 * connection status the lifecycle already publishes, so no extra network listener is needed.
 */
export function useOfflineIndicator() {
  const disconnected = useSyncValue(isDisconnected);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const flag = createDelayedFlag<ReturnType<typeof setTimeout>>(OFFLINE_GRACE_MS, setVisible, {
      set: (callback, ms) => setTimeout(callback, ms),
      clear: clearTimeout,
    });
    // A reconnect clears the flag at once, so the next drop gets its own grace period.
    if (!disconnected) setVisible(false);
    flag.set(disconnected);
    return flag.dispose;
  }, [disconnected]);

  return disconnected && visible;
}
