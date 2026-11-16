import type { ActiveSession } from "@workspace/sync";

/** A Session with no tick for this long is offered to be finished (ADR 0038). */
export const FORGOTTEN_AFTER_MS = 3 * 60 * 60 * 1000;

/** When the Session was last touched: its last tick, else its start. */
export function lastActivity(session: Pick<ActiveSession, "lastTickedAt" | "startedAt">): number {
  return Date.parse(session.lastTickedAt ?? session.startedAt);
}

/**
 * The Session that was forgotten, if any: the oldest active one whose last tick is more than 3 h
 * old, skipping those the user chose to keep going with (`snoozed`: id to the time they said so,
 * asked again 3 h after that).
 */
export function forgottenSession<
  S extends Pick<ActiveSession, "id" | "lastTickedAt" | "startedAt">,
>(sessions: readonly S[], now: number, snoozed: ReadonlyMap<string, number> = new Map()): S | null {
  const stale = sessions.filter((session) => {
    const quietSince = Math.max(lastActivity(session), snoozed.get(session.id) ?? 0);
    return now - quietSince > FORGOTTEN_AFTER_MS;
  });
  // `sort` on a copy: Hermes has no `toSorted`.
  return [...stale].sort((a, b) => lastActivity(a) - lastActivity(b))[0] ?? null;
}

/**
 * Where a forgotten Session finishes: at its last tick plus the rest that tick started, when that
 * Rest was left running (it is then still stored), else at the last tick; at the start if
 * nothing was ever ticked.
 */
export function finishTimeOf(
  session: Pick<ActiveSession, "lastTickedAt" | "startedAt" | "restEndsAt">,
): string {
  const tick = session.lastTickedAt ?? session.startedAt;
  const rest = session.restEndsAt;
  if (session.lastTickedAt !== null && rest !== null && Date.parse(rest) > Date.parse(tick)) {
    return new Date(rest).toISOString();
  }
  return new Date(tick).toISOString();
}
