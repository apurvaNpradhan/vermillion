import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { SESSION_QUERY_KEY } from "@workspace/client/session";
import NetInfo from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";

import { env } from "./env";
import { probeReachable } from "./reachability";

/** Whether a NetInfo state means requests can go out: unknown counts as online. */
export function isReachable(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * Feeds TanStack Query's `onlineManager` from the device's connection, so queries and mutations
 * that need the server pause while offline instead of failing, and run again on reconnect. The
 * reachability probe is our own API's liveness route, so a network that blocks other hosts is not
 * mistaken for offline. A build without the native module leaves the manager as it is (online).
 * Returns the cleanup.
 */
export function watchConnection(queryClient: QueryClient) {
  try {
    NetInfo.configure({
      // Our own probe decides: the OS answer is "connected" on a captive or dead network.
      useNativeReachability: false,
      reachabilityUrl: new URL("/api/health", env.EXPO_PUBLIC_SERVER_URL).toString(),
      reachabilityTest: async (response) => response.status === 200,
      reachabilityShortTimeout: 5000,
      reachabilityLongTimeout: 30_000,
      reachabilityRequestTimeout: 8000,
    });
    onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((s) => setOnline(isReachable(s))),
    );
  } catch {
    return () => undefined;
  }
  // The session is remembered while offline; ask the server again as soon as it can be reached.
  return onlineManager.subscribe((online) => {
    if (online) void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  });
}

/**
 * For an explicit tap: the cached answer when it says online, otherwise one fresh bounded probe
 * before refusing, so a stale "offline" from the last poll never blocks a working connection. A
 * successful probe tells the manager, so the cue clears and paused queries resume.
 */
export async function confirmOnline(): Promise<boolean> {
  if (onlineManager.isOnline()) return true;
  const reachable = await probeReachable(
    new URL("/api/health", env.EXPO_PUBLIC_SERVER_URL).toString(),
    (url, init) => fetch(url, init),
  );
  if (reachable) onlineManager.setOnline(true);
  return reachable;
}

/** Whether the device can reach the server right now (true until proven otherwise). */
export function useIsOnline() {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
}
