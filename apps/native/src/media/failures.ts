/** Consecutive failed attempts before a file counts as failed (an upload can race its row). */
export const FAILURES_BEFORE_FAILED = 3;

/**
 * Failed transfers per file, in memory (a restart tries again). The queue's error handler counts
 * an attempt that failed; a file is `failed` after {@link FAILURES_BEFORE_FAILED} in a row, which
 * is when a view offers Retry. The first attempts of a new upload may reach the server before the
 * media row does, and offline attempts are not recorded at all.
 */
export function createFailureTracker() {
  const counts = new Map<string, number>();
  const listeners = new Set<() => void>();
  let version = 0;
  const changed = () => {
    version += 1;
    for (const listener of listeners) listener();
  };
  const isFailed = (attachmentId: string) =>
    (counts.get(attachmentId) ?? 0) >= FAILURES_BEFORE_FAILED;
  return {
    /** An attempt failed. */
    record(attachmentId: string) {
      const wasFailed = isFailed(attachmentId);
      counts.set(attachmentId, (counts.get(attachmentId) ?? 0) + 1);
      if (isFailed(attachmentId) !== wasFailed) changed();
    },
    /** The file is no longer in question (it arrived, or was dropped). */
    clear(attachmentId: string) {
      const wasFailed = isFailed(attachmentId);
      counts.delete(attachmentId);
      if (wasFailed) changed();
    },
    /** The user asked to try again: one more failure shows `failed` again at once. */
    retrying(attachmentId: string) {
      const wasFailed = isFailed(attachmentId);
      counts.set(attachmentId, FAILURES_BEFORE_FAILED - 1);
      if (wasFailed) changed();
    },
    has: isFailed,
    /** Changes whenever a file enters or leaves `failed`; a snapshot for `useSyncExternalStore`. */
    version: () => version,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type FailureTracker = ReturnType<typeof createFailureTracker>;
