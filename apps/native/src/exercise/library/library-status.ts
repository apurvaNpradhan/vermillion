import type { LibraryShow, SyncSnapshot } from "@workspace/sync";

/**
 * What the library can say about itself. None of these looks like another:
 * `first-sync` (the catalog is downloading), `offline-unsynced` (it cannot download yet),
 * `ready` (an empty list then means no matches) and `error` (a local read failed).
 */
export type LibraryStatus = "first-sync" | "offline-unsynced" | "ready" | "error";

export type StatusInput = {
  /** A local read failed, or the local database is not available. */
  failed: boolean;
  snapshot: Pick<SyncSnapshot, "phase" | "indicator" | "catalogSynced"> | null;
  show: LibraryShow;
};

/**
 * The catalog is the priority-3 stream and arrives after the user's own data, so its own sync
 * status decides, not the whole sync's. Custom and archived lists come from the user's own
 * stream and never wait for the catalog.
 */
export function libraryStatus({ failed, snapshot, show }: StatusInput): LibraryStatus {
  if (failed) return "error";
  if (show !== "all" || snapshot?.catalogSynced === true) return "ready";
  if (snapshot === null) return "first-sync";
  if (snapshot.indicator === "locked" || snapshot.indicator === "update-required") {
    return "offline-unsynced";
  }
  // Right after launch the connection has not been tried yet: that is not "offline".
  if (snapshot.indicator === "paused" && snapshot.phase.kind === "active") {
    return "offline-unsynced";
  }
  return "first-sync";
}
