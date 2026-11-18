import type { SyncSnapshot } from "@workspace/sync";

/**
 * What the Train list can say about itself. None of these looks like another: `loading` (the first
 * local read), `first-sync` (nothing yet, and the account's data is downloading),
 * `first-sync-offline` (the same, but the device cannot download: it needs a connection), `empty`,
 * `list` and `error` (a local read failed).
 */
export type TrainStatus =
  | "loading"
  | "first-sync"
  | "first-sync-offline"
  | "empty"
  | "list"
  | "error";

/** Either way of waiting for the account's first download. */
export function isFirstSync(status: TrainStatus): boolean {
  return status === "first-sync" || status === "first-sync-offline";
}

export function trainStatus(input: {
  failed: boolean;
  /** No result has arrived yet. */
  loading: boolean;
  count: number;
  snapshot: Pick<SyncSnapshot, "hasSynced" | "indicator" | "phase"> | null;
  /** Reachability of our server (the health probe), not whether PowerSync is connected yet. */
  online: boolean;
}): TrainStatus {
  if (input.failed) return "error";
  if (input.loading) return "loading";
  if (input.count > 0) return "list";
  const waiting =
    input.snapshot !== null &&
    !input.snapshot.hasSynced &&
    input.snapshot.indicator !== "locked" &&
    input.snapshot.indicator !== "update-required";
  if (!waiting) return "empty";
  // Only an unreachable server means the download cannot happen: a client that is active but not
  // connected yet is in its normal handshake, not offline.
  return !input.online && input.snapshot?.phase.kind === "active"
    ? "first-sync-offline"
    : "first-sync";
}

/** The status of a screen that shows two lists (Programs and Workouts) from their own statuses. */
export function combineStatus(a: TrainStatus, b: TrainStatus): TrainStatus {
  const both = [a, b];
  if (both.includes("error")) return "error";
  if (both.includes("loading")) return "loading";
  if (both.includes("list")) return "list";
  if (both.includes("first-sync-offline")) return "first-sync-offline";
  if (both.includes("first-sync")) return "first-sync";
  return "empty";
}
