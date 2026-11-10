/** The scheduled notification of a Session's Rest; the id is stable so a stale one is always replaced. */
export const REST_NOTIFICATION_PREFIX = "rest:";
export const restNotificationId = (sessionId: string) => `${REST_NOTIFICATION_PREFIX}${sessionId}`;

/** An active Session as the schedule sees it. */
export type ScheduleSession = {
  id: string;
  title: string;
  /** The stored end of its Rest, if it has one. */
  restEndsAt: string | null;
  /** This device owns the Session; another device's Rest is its business. */
  owned: boolean;
};

export type RestSchedulePlan = {
  /** Notifications to (re)schedule: the Session, when it fires. */
  schedule: { sessionId: string; title: string; endsAt: number }[];
  /** Scheduled notification ids to cancel. */
  cancel: string[];
};

/** A Rest that ends less than this far ahead is not worth a notification. */
const MIN_LEAD_MS = 1000;

/**
 * What to do so the scheduled notifications match the stored Rests (the source of truth):
 * - a Session this device owns, with a Rest ending in the future, has exactly one notification at
 *   that end time (nothing to do when it is already scheduled for it);
 * - every other notification with a Rest's id is cancelled: a finished Rest, a Rest skipped or
 *   cleared, a Session taken over by another device, a Session gone;
 * - without permission nothing can be scheduled.
 * `known` is what this process scheduled before (Session id to end time); it only avoids
 * rescheduling the same time on every write, so after a restart everything is reconciled once.
 */
export function planRestSchedule(input: {
  sessions: readonly ScheduleSession[];
  /** The ids of the Rest notifications the system holds now. */
  scheduledIds: readonly string[];
  known: ReadonlyMap<string, number>;
  now: number;
  granted: boolean;
}): RestSchedulePlan {
  const schedule: RestSchedulePlan["schedule"] = [];
  const wanted = new Set<string>();
  for (const session of input.sessions) {
    if (!input.granted || !session.owned || session.restEndsAt === null) continue;
    const endsAt = Date.parse(session.restEndsAt);
    if (Number.isNaN(endsAt) || endsAt - input.now < MIN_LEAD_MS) continue;
    wanted.add(restNotificationId(session.id));
    const held = input.scheduledIds.includes(restNotificationId(session.id));
    if (!held || input.known.get(session.id) !== endsAt) {
      schedule.push({ sessionId: session.id, title: session.title, endsAt });
    }
  }
  const cancel = input.scheduledIds.filter((id) => !wanted.has(id));
  return { schedule, cancel };
}
