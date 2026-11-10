import type { SyncSnapshot } from "@workspace/sync";

/**
 * What the Train list can say about itself. None of these looks like another: `loading` (the first
 * local read), `first-sync` (nothing yet, and the account's data has not downloaded), `empty`,
 * `list` and `error` (a local read failed).
 */
export type TrainStatus = "loading" | "first-sync" | "empty" | "list" | "error";

export function trainStatus(input: {
  failed: boolean;
  /** No result has arrived yet. */
  loading: boolean;
  count: number;
  snapshot: Pick<SyncSnapshot, "hasSynced" | "indicator"> | null;
}): TrainStatus {
  if (input.failed) return "error";
  if (input.loading) return "loading";
  if (input.count > 0) return "list";
  const waiting =
    input.snapshot !== null &&
    !input.snapshot.hasSynced &&
    input.snapshot.indicator !== "locked" &&
    input.snapshot.indicator !== "update-required";
  return waiting ? "first-sync" : "empty";
}
