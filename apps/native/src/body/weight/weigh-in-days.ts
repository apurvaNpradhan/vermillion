const DAY_MS = 86_400_000;

/** One count per calendar day (UTC midnight of its `YYYY-MM-DD`) that has a weigh-in. */
export function weighInCounts(entries: readonly { local_date: string }[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    const day = Date.parse(entry.local_date);
    if (Number.isFinite(day)) counts.set(day, 1);
  }
  return counts;
}

/** Whole days from `last` to `today` (both `YYYY-MM-DD`); 0 when either does not parse. */
export function daysSince(last: string, today: string): number {
  const days = (Date.parse(today) - Date.parse(last)) / DAY_MS;
  return Number.isFinite(days) ? Math.max(0, Math.round(days)) : 0;
}

/** How long without a weigh-in before the trend is called stale. */
export const STALE_DAYS = 7;

/** The trend is stale when the last weigh-in is more than a week old. */
export function trendIsStale(last: string | null, today: string): boolean {
  return last !== null && daysSince(last, today) > STALE_DAYS;
}
