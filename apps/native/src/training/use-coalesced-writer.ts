import { useCallback, useEffect, useRef } from "react";

/** How long edits wait for another one before they are written. */
export const SAVE_DELAY_MS = 400;

/**
 * Collects edits to one row and writes them together once typing or stepping pauses. `queue`
 * merges a patch; `flush` writes now (and runs when the screen goes away, so nothing is lost);
 * `busy` is true while a patch waits or is being written, so a screen keeps its own values
 * instead of adopting a stale copy that arrives from the database.
 */
export function useCoalescedWriter<Patch extends object>(
  write: (patch: Patch) => Promise<boolean>,
  delay: number = SAVE_DELAY_MS,
) {
  const writeRef = useRef(write);
  useEffect(() => {
    writeRef.current = write;
  });
  const pending = useRef<Patch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(0);

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    pending.current = null;
    if (patch === null) return;
    inflight.current += 1;
    void writeRef.current(patch).finally(() => {
      inflight.current -= 1;
    });
  }, []);

  const queue = useCallback(
    (patch: Patch) => {
      pending.current = { ...pending.current, ...patch };
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  useEffect(() => flush, [flush]);
  const busy = useCallback(() => pending.current !== null || inflight.current > 0, []);
  return { queue, flush, busy };
}
