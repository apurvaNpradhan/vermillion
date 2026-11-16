import { useEffect, useState } from "react";

const STEP_MS = 40;

/**
 * How many exercises (from the top) have their closed body built, hidden. The open exercise is
 * built at once; the rest follow one per tick after the first paint, so opening another exercise
 * flips visibility instead of mounting its set rows during the tap.
 */
export function useWarmCount(total: number) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (count >= total) return;
    const timer = setTimeout(() => setCount((value) => Math.min(total, value + 1)), STEP_MS);
    return () => clearTimeout(timer);
  }, [count, total]);
  return Math.min(count, total);
}
