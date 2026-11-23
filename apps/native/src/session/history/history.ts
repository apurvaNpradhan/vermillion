import { weekStartDay, type WeekStart } from "@workspace/shared";
import type { HistoryOverviewSession } from "@workspace/sync";

import type { History } from "./history-calendar";

export type HistoryItem =
  | { kind: "week"; id: string; sessions: readonly HistoryOverviewSession[] }
  | { kind: "session"; id: string; session: HistoryOverviewSession };

/** Every session newest first, each week's first session preceded by that week's heading. */
export function historyListItems(
  sessions: readonly HistoryOverviewSession[],
  stats: History["bySession"],
  weekStart: WeekStart,
): HistoryItem[] {
  const items: HistoryItem[] = [];
  const weeks = new Map<number, HistoryOverviewSession[]>();
  for (const session of sessions) {
    const day = stats.get(session.id)?.day;
    if (day !== undefined) {
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

/**
 * The list item a day jumps to: the first workout on or before `day` (the list runs newest
 * first), or its week heading when it opens that week. -1 when no workout is that old.
 */
export function itemIndexForDay(
  items: readonly HistoryItem[],
  stats: History["bySession"],
  day: number,
): number {
  const index = items.findIndex(
    (item) => item.kind === "session" && (stats.get(item.id)?.day ?? Infinity) <= day,
  );
  return index > 0 && items[index - 1]?.kind === "week" ? index - 1 : index;
}
