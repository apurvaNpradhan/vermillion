import type { FinishedSession } from "@workspace/sync";

import { isoWeekKey } from "@workspace/shared";
export { isoWeekKey } from "@workspace/shared";

export function groupSessionWeeks(sessions: readonly FinishedSession[], timezone: string) {
  const weeks = new Map<string, FinishedSession[]>();
  for (const session of [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at))) {
    const key = isoWeekKey(session.started_at, timezone);
    const group = weeks.get(key) ?? [];
    group.push(session);
    weeks.set(key, group);
  }
  return [...weeks].map(([week, sessions]) => ({ week, sessions }));
}
