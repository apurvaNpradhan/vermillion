import type { Phase } from "./lifecycle-state";

/**
 * What the UI shows (phase 6 designs it; this is the data).
 *
 * - `connected`: syncing normally, nothing waiting.
 * - `uploading`: local changes are being sent.
 * - `paused`: the device is not syncing (offline, not signed in yet, being reset) but nothing is wrong.
 * - `locked`: sync waits for an account action: sign in again, or switch back from another account.
 * - `update-required`: this build is too old for the server; changes are kept, uploads paused.
 */
export type SyncIndicator = "connected" | "uploading" | "paused" | "locked" | "update-required";

/** Why a `locked` device is locked. */
export type LockReason = "signed-out" | "other-account";

export type SyncSnapshot = {
  phase: Phase;
  /** Install identity captured by forms; a reset invalidates all old submissions. */
  writeScope: string | null;
  indicator: SyncIndicator;
  lockReason: LockReason | null;
  /** Local changes not yet acknowledged by the server. */
  pendingCount: number;
  /** Epoch milliseconds since which something has been waiting, or null. In memory only. */
  pendingSince: number | null;
  lastSyncedAt: Date | null;
  /** Whether the first full sync finished at least once on this install. */
  hasSynced: boolean;
  /**
   * Whether the exercise catalog (the priority-3 stream) has downloaded at least once. It
   * arrives after the user's own data, so `hasSynced` of the whole sync lags behind it.
   */
  catalogSynced: boolean;
};

/** Sync priority of the `exercise_catalog` stream (`powersync/sync-config.yaml`). */
export const CATALOG_PRIORITY = 3;

export type SyncFacts = {
  connected: boolean;
  uploading: boolean;
  pendingCount: number;
};

export function deriveIndicator(phase: Phase, facts: SyncFacts): SyncIndicator {
  switch (phase.kind) {
    case "update-required":
      return "update-required";
    case "reauth-required":
    case "blocked":
      return "locked";
    case "active":
      if (!facts.connected) return "paused";
      return facts.uploading || facts.pendingCount > 0 ? "uploading" : "connected";
    default:
      return "paused";
  }
}

export function deriveLockReason(phase: Phase): LockReason | null {
  if (phase.kind === "reauth-required") return "signed-out";
  if (phase.kind === "blocked") return "other-account";
  return null;
}

/** Keeps the moment the queue first became non-empty; resets when it empties. */
export function trackPendingSince(
  previous: number | null,
  pendingCount: number,
  now: number,
): number | null {
  if (pendingCount === 0) return null;
  return previous ?? now;
}
