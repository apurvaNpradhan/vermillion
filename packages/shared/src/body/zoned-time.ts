/** Wall-clock fields of an instant in an IANA time zone. Months are 1–12. */
export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

const FIELDS = ["year", "month", "day", "hour", "minute"] as const; // Safety: literal field names.

export function zonedParts(iso: string, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const [year, month, day, hour, minute] = FIELDS.map(get);
  return {
    year: year ?? 0,
    month: month ?? 1,
    day: day ?? 1,
    hour: (hour ?? 0) % 24,
    minute: minute ?? 0,
  };
}

const offsetAt = (utc: number, timeZone: string) => {
  const p = zonedParts(new Date(utc).toISOString(), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(utc / 60000) * 60000;
};

/**
 * The instant whose wall clock in `timeZone` reads `parts`. Fields may overflow (day 32, hour -1)
 * and are normalised like `Date.UTC`. A wall time skipped by a DST jump resolves past the gap.
 */
export function fromZonedParts(parts: ZonedParts, timeZone: string): string {
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let utc = wall - offsetAt(wall, timeZone);
  utc = wall - offsetAt(utc, timeZone);
  return new Date(utc).toISOString();
}

/** Steps one wall-clock field of an instant in `timeZone`, clamping the day for month/year steps. */
export function stepZoned(
  iso: string,
  timeZone: string,
  field: keyof ZonedParts,
  amount: number,
): string {
  const p = zonedParts(iso, timeZone);
  const next = { ...p, [field]: p[field] + amount };
  if (field === "year" || field === "month") {
    const lastDay = new Date(Date.UTC(next.year, next.month, 0)).getUTCDate();
    next.day = Math.min(p.day, lastDay);
  }
  return fromZonedParts(next, timeZone);
}
