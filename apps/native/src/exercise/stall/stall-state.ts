import { z } from "zod";

const dismissal = z.object({ sessionId: z.string(), dismissed: z.boolean() });

/** Dismiss only the current note. A new baseline Session can show a fresh verdict. */
export function readStallMemory(raw: string | null, latestSessionId: string | null) {
  if (raw === null || latestSessionId === null) return { dismissed: false };
  try {
    const stored = dismissal.safeParse(JSON.parse(raw)).data;
    return { dismissed: stored?.sessionId === latestSessionId && stored.dismissed };
  } catch {
    return { dismissed: false };
  }
}
