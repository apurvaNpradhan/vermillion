import { sessionDurationSeconds } from "@workspace/shared";
import type { SessionDetail } from "@workspace/sync";

/** The Session's duration in seconds: the user's override, else the time trained from start to finish. */
export function sessionDuration(
  session: Pick<SessionDetail, "durationS" | "startedAt" | "finishedAt" | "pausedMs">,
): number {
  return sessionDurationSeconds(
    { ...session, finishedAt: session.finishedAt ?? session.startedAt },
    0,
  );
}
