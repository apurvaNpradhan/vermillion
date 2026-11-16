import type { SessionDetail } from "@workspace/sync";

/** The Session's duration in seconds: the user's override, else start to finish. */
export function sessionDuration(
  session: Pick<SessionDetail, "durationS" | "startedAt" | "finishedAt">,
): number {
  return (
    session.durationS ??
    Math.max(
      0,
      (Date.parse(session.finishedAt ?? session.startedAt) - Date.parse(session.startedAt)) / 1000,
    )
  );
}
