import { describe, expect, it } from "vitest";
import { weekStartKey } from "@workspace/shared";
import { emptyTotals } from "./history-calendar";
import { historyListItems, itemIndexForDay } from "./history";
describe("ISO weeks in the account zone", () => {
  it("puts a UTC Monday into the previous week west of UTC", () => {
    expect(weekStartKey("2026-01-05T00:30:00Z", "America/Los_Angeles", "monday")).toBe(
      "2025-12-29",
    );
    expect(weekStartKey("2026-01-05T00:30:00Z", "Asia/Kolkata", "monday")).toBe("2026-01-05");
  });
  it("keeps spring DST Sunday in one week", () => {
    for (const time of ["2026-03-08T09:30:00Z", "2026-03-08T10:30:00Z"])
      expect(weekStartKey(time, "America/Los_Angeles", "monday")).toBe("2026-03-02");
  });
  it("keeps both fall repeated hours in one week", () => {
    for (const time of ["2026-11-01T08:30:00Z", "2026-11-01T09:30:00Z"])
      expect(weekStartKey(time, "America/Los_Angeles", "monday")).toBe("2026-10-26");
  });
  it("handles year boundaries and empty history", () => {
    expect(weekStartKey("2027-01-01T12:00:00Z", "UTC", "monday")).toBe("2026-12-28");
    expect(historyListItems([], new Map(), "monday")).toEqual([]);
  });
});

describe("history list", () => {
  const DAY = 86_400_000;
  const monday = Date.UTC(2026, 10, 16);
  const session = (id: string, day: number) => ({
    session: {
      id,
      title: id,
      started_at: new Date(day).toISOString(),
      finished_at: new Date(day + 3_600_000).toISOString(),
      durationS: null,
      pausedMs: null,
      exerciseTitles: [],
      sets: [],
    },
    day,
  });
  const rows = [
    session("thursday", monday + 3 * DAY),
    session("tuesday", monday + DAY),
    session("last-friday", monday - 3 * DAY),
  ];
  const stats = new Map(rows.map((row) => [row.session.id, { day: row.day, totals: emptyTotals }]));
  const items = historyListItems(
    rows.map((row) => row.session),
    stats,
    "monday",
  );

  it("heads each week once and lists its sessions under it", () => {
    expect(items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      `week:${monday}`,
      "session:thursday",
      "session:tuesday",
      `week:${monday - 7 * DAY}`,
      "session:last-friday",
    ]);
  });

  it("jumps a day to the newest workout on or before it, or to its week heading", () => {
    expect(itemIndexForDay(items, stats, monday + 3 * DAY)).toBe(0);
    expect(itemIndexForDay(items, stats, monday + 2 * DAY)).toBe(2);
    expect(itemIndexForDay(items, stats, monday - DAY)).toBe(3);
    expect(itemIndexForDay(items, stats, monday - 30 * DAY)).toBe(-1);
  });
});
