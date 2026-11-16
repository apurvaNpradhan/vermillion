/**
 * When a Rest was ended early, per Session. Skip clears the stored Rest, so without this the work
 * clock would count from the last tick and include the skipped Rest. Kept for the app's lifetime,
 * shared by every screen; a later tick or Rest end outweighs it, so a stale mark is harmless.
 */
const ended = new Map<string, number>();

export function markRestEnded(sessionId: string, at: number = Date.now()): void {
  ended.set(sessionId, at);
}

export function restEndedAt(sessionId: string): number | null {
  return ended.get(sessionId) ?? null;
}
