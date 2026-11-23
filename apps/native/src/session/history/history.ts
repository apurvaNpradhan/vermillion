import { weekStartDay, type WeekStart } from "@workspace/shared";
import type { HistoryOverviewSession } from "@workspace/sync";

import type { History } from "./history-calendar";

export type HistoryItem =
  | { kind: "week"; id: string; sessions: readonly HistoryOverviewSession[] }
  | { kind: "session"; id: string; session: HistoryOverviewSession };

export function historyListItems(
  sessions: readonly HistoryOverviewSession[],
  groupByWeek: boolean,
  stats: History["bySession"],
  weekStart: WeekStart,
): HistoryItem[] {
  const items: HistoryItem[] = [];
  const weeks = new Map<number, HistoryOverviewSession[]>();
  for (const session of sessions) {
    const day = stats.get(session.id)?.day;
    if (groupByWeek && day !== undefined) {
      const week = weekStartDay(day, weekStart);
      let entries = weeks.get(week);
      if (entries === undefined) {
        entries = [];
        weeks.set(week, entries);
        items.push({ kind: "week", id: String(week), sessions: entries });
      }
      entries.push(session);
    }
    items.push({ kind: "session", id: session.id, session });
  }
  return items;
}
