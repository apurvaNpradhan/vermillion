import { ORPCError } from "@orpc/client";

/** What a failed call can throw; the same shape as `ApiError` without importing it. */
type Thrown = Error | null | undefined;

/** Messages the platforms' `fetch` throws when no response arrived (Hermes, Safari, Chrome). */
const NETWORK_MESSAGE =
  /network request failed|failed to fetch|network error|load failed|internet connection appears to be offline|network connection was lost|timed out|timeout|aborted/i;

/** Error names a fetch raises for a cancelled or timed-out request. */
const NETWORK_NAMES = new Set(["AbortError", "TimeoutError", "NetworkError"]);

/** How far down a `cause` chain to look. */
const MAX_CAUSE_DEPTH = 4;

function isNetworkFailure(error: Error, depth: number): boolean {
  // An ORPCError is an answer from the server (even a 5xx): never the device's connection.
  const own =
    !(error instanceof ORPCError) &&
    (NETWORK_NAMES.has(error.name) ||
      ((error instanceof TypeError || error.name === "Error") &&
        NETWORK_MESSAGE.test(error.message)));
  if (own) return true;
  const cause = error.cause;
  return depth < MAX_CAUSE_DEPTH && cause instanceof Error && isNetworkFailure(cause, depth + 1);
}

/**
 * True when a call failed because no answer came back: the device is offline, the host was
 * unreachable, or the request timed out. Offline is a state, not a fault: callers stay silent or
 * say "needs a connection", never "something went wrong". Never throws.
 */
export function isNetworkError(error: Thrown): boolean {
  return error instanceof Error && isNetworkFailure(error, 0);
}

/** True for a Better Auth failure that never reached the server (its client reports status 0). */
export function isOfflineAuthFailure(failure: { status?: number | undefined } | null | undefined) {
  return failure?.status === 0;
}
