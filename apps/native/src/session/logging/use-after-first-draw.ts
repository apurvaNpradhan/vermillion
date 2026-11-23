import { useCallback, useEffect, useState } from "react";

/** The longest the slow, secondary reads wait for the list to say it has drawn. */
export const FIRST_DRAW_FALLBACK_MS = 1500;

/**
 * Turns true once the screen's list has drawn its rows (call `drawn` from its load callback), or
 * after `fallbackMs` if it never says so. Slow reads that only fill values in (Previous, Ghost
 * values) wait on it, so parsing them cannot hold the first draw back.
 */
export function useAfterFirstDraw(fallbackMs = FIRST_DRAW_FALLBACK_MS) {
  const [ready, setReady] = useState(false);
  const drawn = useCallback(() => setReady(true), []);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), fallbackMs);
    return () => clearTimeout(timer);
  }, [fallbackMs]);
  return { ready, drawn };
}
