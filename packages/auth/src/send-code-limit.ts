/**
 * Per-address ceiling on asking for sign-in codes, on top of Better Auth's per-IP rule. A fixed
 * window held in process memory (no Redis): one instance, reset on restart. It stops one inbox
 * being flooded from many addresses of origin; the per-IP rule stops one origin flooding many.
 */
export const SEND_CODE_PER_EMAIL = { windowMs: 10 * 60_000, max: 5 } as const;

export function createSendCodeLimiter(now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** Counts one request for the address; false once it has used up the window. */
    hit(email: string): boolean {
      const time = now();
      if (hits.size > 10_000) {
        for (const [stored, entry] of hits) if (entry.resetAt <= time) hits.delete(stored);
      }
      const key = email.trim().toLowerCase();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= time) {
        hits.set(key, { count: 1, resetAt: time + SEND_CODE_PER_EMAIL.windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= SEND_CODE_PER_EMAIL.max;
    },
  };
}
