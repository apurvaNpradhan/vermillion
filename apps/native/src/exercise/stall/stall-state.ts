import { z } from "zod";

const DISMISS_MS = 30 * 86_400_000;

/** A dismissal snoozes the note across Sessions. An applied load cut still belongs to one Session. */
const stallMemorySchema = z.object({
  sessionId: z.string(),
  dismissed: z.boolean(),
  dismissedUntil: z.number().nullable().optional(),
  applied: z.boolean(),
});
type StallMemory = z.infer<typeof stallMemorySchema>;
type StallFlags = Pick<StallMemory, "dismissed" | "applied">;

const NONE: StallFlags = { dismissed: false, applied: false };

function parse(raw: string | null): StallMemory | null {
  if (raw === null) return null;
  try {
    return stallMemorySchema.safeParse(JSON.parse(raw)).data ?? null;
  } catch {
    return null;
  }
}

/** The memory in `raw` (stored JSON or null) as it applies with `latestSessionId` newest. */
export function readStallMemory(
  raw: string | null,
  latestSessionId: string | null,
  now = Date.now(),
): StallFlags {
  const stored = parse(raw);
  if (!stored || latestSessionId === null) return NONE;
  const same = stored.sessionId === latestSessionId;
  return {
    dismissed:
      stored.dismissedUntil != null ? stored.dismissedUntil > now : same && stored.dismissed,
    applied: same && stored.applied,
  };
}

export function writeStallMemory(
  raw: string | null,
  latestSessionId: string,
  change: Partial<StallFlags>,
  now = Date.now(),
): string {
  const current = readStallMemory(raw, latestSessionId, now);
  const dismissedUntil =
    change.dismissed === true
      ? now + DISMISS_MS
      : change.dismissed === false
        ? null
        : parse(raw)?.dismissedUntil;
  return JSON.stringify({ sessionId: latestSessionId, ...current, ...change, dismissedUntil });
}
