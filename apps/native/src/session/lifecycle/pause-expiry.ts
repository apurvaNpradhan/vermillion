import { PAUSE_AUTO_RESUME_MS, pauseExpiresAt } from "@workspace/shared";
import type { ActiveSession } from "@workspace/sync";

/**
 * The paused Sessions this device owns whose pause has run out (4 h), each with the moment its
 * pause is taken to end: `paused_at` plus the longest pause. Resuming there counts the pause as
 * 4 h and the time after it as training, so the forgotten-session check then judges the Session
 * by its last tick as it always does.
 */
export function expiredPauses<S extends Pick<ActiveSession, "id" | "pausedAt" | "deviceId">>(
  sessions: readonly S[],
  now: number,
  installId: string,
): { id: string; resumeAt: number }[] {
  return sessions.flatMap((session) => {
    if (session.pausedAt === null || session.deviceId !== installId) return [];
    const resumeAt = pauseExpiresAt(session.pausedAt);
    return now - Date.parse(session.pausedAt) >= PAUSE_AUTO_RESUME_MS
      ? [{ id: session.id, resumeAt }]
      : [];
  });
}
