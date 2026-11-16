import type { WeekStart } from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";

import { weekStartKey } from "@workspace/shared";

export function groupSessionWeeks(
  sessions: readonly FinishedSession[],
  timezone: string,
  weekStart: WeekStart,
) {
  const weeks = new Map<string, FinishedSession[]>();
  for (const session of [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at))) {
    const key = weekStartKey(session.started_at, timezone, weekStart);
    const group = weeks.get(key) ?? [];
    group.push(session);
    weeks.set(key, group);
  }
  return [...weeks].map(([week, sessions]) => ({ week, sessions }));
}
