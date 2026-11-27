import { useCallback, useLayoutEffect, useRef } from "react";

/** What a handler is called with: plain values or a continuation from an event. */
type Arg = string | number | boolean | null | undefined | (() => void);

/**
 * A handler whose identity never changes and that always runs the latest `handler`. Rows are
 * memoized, so passing them a handler rebuilt on every data change would redraw every row.
 * Call it from events only, never during render.
 */
export function useStableHandler<Args extends readonly Arg[], Result = void>(
  handler: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
