import { z } from "zod";

/**
 * What the device remembers about a stalled lift: that its note was dismissed, or that today's
 * deload was applied. It belongs to one last Session; once the exercise has a newer Session the
 * memory no longer applies (the history changed), so the note can show again.
 */
const stallMemorySchema = z.object({
  sessionId: z.string(),
  dismissed: z.boolean(),
  applied: z.boolean(),
});
type StallMemory = z.infer<typeof stallMemorySchema>;
type StallFlags = Omit<StallMemory, "sessionId">;

const NONE: StallFlags = { dismissed: false, applied: false };

/** The memory in `raw` (stored JSON or null) as it applies with `latestSessionId` newest. */
export function readStallMemory(raw: string | null, latestSessionId: string | null): StallFlags {
  if (raw === null || latestSessionId === null) return NONE;
  try {
    const parsed = stallMemorySchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.sessionId === latestSessionId
      ? { dismissed: parsed.data.dismissed, applied: parsed.data.applied }
      : NONE;
  } catch {
    return NONE;
  }
}

/** The JSON to store after changing one flag, keeping the other if the Session is the same. */
export function writeStallMemory(
  raw: string | null,
  latestSessionId: string,
  change: Partial<StallFlags>,
): string {
  const current = readStallMemory(raw, latestSessionId);
  return JSON.stringify({ sessionId: latestSessionId, ...current, ...change });
}
