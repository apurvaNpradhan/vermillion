import type { LockReason } from "@workspace/sync";

/**
 * What onboarding shows first. A device that another account's data blocks cannot save a single
 * preference, so the owner choice (switch back or discard) comes before step 1; every other lock
 * (signed out, update required) leaves the steps to run as before.
 */
export type SetupGate = "owner-choice" | "steps";

export function setupGate(lockReason: LockReason | null): SetupGate {
  return lockReason === "other-account" ? "owner-choice" : "steps";
}
