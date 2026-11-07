/** Per-key fixed-window limiter held in process memory (no Redis dependency). */
export function createRateLimiter(now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** Counts one hit; false once the key has used up `max` in the current window. */
    hit(key: string, { windowMs, max }: { windowMs: number; max: number }): boolean {
      const time = now();
      if (hits.size > 10_000) {
        for (const [stored, entry] of hits) if (entry.resetAt <= time) hits.delete(stored);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= time) {
        hits.set(key, { count: 1, resetAt: time + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
