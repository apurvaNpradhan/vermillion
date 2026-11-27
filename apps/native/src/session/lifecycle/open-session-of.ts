import type { ActiveSession } from "@workspace/sync";

/**
 * The open Session that was started from a workout, so a card for that workout resumes it rather
 * than offering to start it again. `sessions` is newest first.
 */
export function openSessionOf(
  sessions: readonly ActiveSession[],
  workoutId: string | null,
): ActiveSession | undefined {
  if (workoutId === null) return undefined;
  return sessions.find((session) => session.workoutId === workoutId);
}
