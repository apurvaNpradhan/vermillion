import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A handler whose identity never changes and that always runs the latest `handler`. Rows are
 * memoized, so passing them a handler rebuilt on every data change would redraw every row.
 * Call it from events only, never during render.
 */
export function useStableHandler<Args extends readonly string[]>(
  handler: (...args: Args) => void,
): (...args: Args) => void {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
