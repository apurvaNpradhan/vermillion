/** An offset-free timestamp from the source file. */
export type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond?: number;
};

/** The same fields on the UTC calendar, usable as a sort key and a validity check. */
export function wallClockMillis(value: WallClock): number {
  const date = new Date(0);
  date.setUTCFullYear(value.year, value.month - 1, value.day);
  date.setUTCHours(value.hour, value.minute, value.second, value.millisecond ?? 0);
  return date.getUTCFullYear() === value.year &&
    date.getUTCMonth() + 1 === value.month &&
    date.getUTCDate() === value.day &&
    date.getUTCHours() === value.hour &&
    date.getUTCMinutes() === value.minute &&
    date.getUTCSeconds() === value.second
    ? date.getTime()
    : NaN;
}

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function createImportClock(timeZone: string) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      calendar: "iso8601",
      numberingSystem: "latn",
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    return null;
  }

  function offsetAt(at: number) {
    const parts = new Map(formatter.formatToParts(at).map(({ type, value }) => [type, value]));
    return (
      wallClockMillis({
        year: Number(parts.get("year")),
        month: Number(parts.get("month")),
        day: Number(parts.get("day")),
        hour: Number(parts.get("hour")),
        minute: Number(parts.get("minute")),
        second: Number(parts.get("second")),
      }) - at
    );
  }

  const offsetsByDay = new Map<number, Set<number>>();
  return (value: WallClock): { iso: string; overlap: boolean } | null => {
    const wall = wallClockMillis(value);
    if (Number.isNaN(wall)) return null;
    const dayMs = 86_400_000;
    const day = Math.floor(wall / dayMs) * dayMs;
    let offsets = offsetsByDay.get(day);
    if (!offsets) {
      // Sample either side of a transition. Validate each candidate at the instant itself,
      // so a spring-forward gap has no candidate and a fall-back overlap has two.
      offsets = new Set([
        offsetAt(day - dayMs),
        offsetAt(day),
        offsetAt(day + dayMs),
        offsetAt(day + 2 * dayMs),
      ]);
      offsetsByDay.set(day, offsets);
    }
    const candidates = [...offsets].flatMap((offset) => {
      const instant = wall - offset;
      return offsetAt(Math.floor(instant / 1000) * 1000) === offset ? [instant] : [];
    });
    if (candidates.length === 0) return null;
    // Exports lack an offset. Preview discloses that we pick the first occurrence.
    return { iso: new Date(Math.min(...candidates)).toISOString(), overlap: candidates.length > 1 };
  };
}
