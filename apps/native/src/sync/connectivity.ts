import type { SyncSnapshot } from "@workspace/sync";

/** How long the device must stay disconnected before the Offline pill appears. */
export const OFFLINE_GRACE_MS = 2000;

/**
 * Whether sync has lost its connection: the account is active but not connected. Locked and
 * update-required states are the banner's job, and a device that has not started or has no
 * account yet is not "offline".
 */
export function isDisconnected(snapshot: Pick<SyncSnapshot, "phase" | "indicator"> | null) {
  return snapshot !== null && snapshot.phase.kind === "active" && snapshot.indicator === "paused";
}

type Timers<Handle> = {
  set: (callback: () => void, ms: number) => Handle;
  clear: (handle: Handle) => void;
};

/**
 * A flag that rises only after `delayMs` of being asked for and falls at once: a brief drop
 * never shows, and reconnecting hides it without waiting. Timers are injected for tests.
 */
export function createDelayedFlag<Handle>(
  delayMs: number,
  onChange: (value: boolean) => void,
  timers: Timers<Handle>,
) {
  let value = false;
  let pending: Handle | null = null;
  const settle = (next: boolean) => {
    if (next === value) return;
    value = next;
    onChange(next);
  };
  return {
    set(wanted: boolean) {
      if (wanted) {
        if (value || pending !== null) return;
        pending = timers.set(() => {
          pending = null;
          settle(true);
        }, delayMs);
        return;
      }
      if (pending !== null) {
        timers.clear(pending);
        pending = null;
      }
      settle(false);
    },
    dispose() {
      if (pending !== null) timers.clear(pending);
      pending = null;
    },
  };
}
