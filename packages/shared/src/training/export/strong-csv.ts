import type { SetKind, WeightUnit } from "../vocabulary/vocabulary";
import { KG_PER_LB } from "../vocabulary/format";

/** One ticked set of a finished Session, with what the export writes of its Session and exercise. */
export type SessionExportRow = {
  sessionId: string;
  workout: string;
  /** ISO time the Session started. */
  startedAt: string;
  /** Seconds the Session lasted (its recorded duration, else finish minus start), or null. */
  sessionDurationS: number | null;
  sessionNote: string | null;
  /** Tells two exercises of one Session apart (the same lift can appear twice). */
  exerciseKey: string;
  exercise: string;
  exerciseNote: string | null;
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  rpe: number | null;
};

/**
 * Strong's export layout, which Hevy and Lyfta import and our own importer reads (see
 * `history-import/fixtures.ts`): these columns, in this order, with the weight in the user's unit
 * (the header does not name it, as in Strong), the distance in metres and `Seconds` for a timed
 * set.
 */
export const STRONG_CSV_HEADER = [
  "Date",
  "Workout Name",
  "Duration",
  "Exercise Name",
  "Set Order",
  "Weight",
  "Reps",
  "Distance",
  "Seconds",
  "Notes",
  "Workout Notes",
  "RPE",
] as const;

/**
 * A cell as CSV text. Text that a spreadsheet would run as a formula (it starts with `=`, `+`,
 * `-`, `@`, tab or a carriage return) is prefixed with an apostrophe, and anything with a comma,
 * quote or line break is quoted.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const number = (value: number | null, digits: number) =>
  value === null ? "0" : String(Number(value.toFixed(digits)));

/** The local wall-clock time of an ISO time in a time zone, as Strong writes it: `2026-11-20 18:30:00`. */
function localDateTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

/** Strong's duration text: `1h 5m`, `45m`, `0m`. Whole minutes, rounded. */
export function strongDuration(seconds: number | null): string {
  const minutes = Math.round((seconds ?? 0) / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** Strong has no top, back-off or myo-rep sets: those are numbered like working sets. */
const SET_LETTER: Partial<Record<SetKind, string>> = {
  warmup: "W",
  drop: "D",
  failure: "F",
};

/**
 * Every finished Session in Strong's CSV format (RFC 4180, CRLF line ends): one line per ticked
 * set, in the order given (oldest first). Working sets are numbered from 1 within their exercise;
 * warm-up, drop and failure sets are `W`, `D` and `F`. Bodyweight and unused cells are `0`, effort
 * is the RPE, the exercise note is on the exercise's first line and the workout note on every
 * line. The date is the local time in `timeZone`. Floors and steps have no Strong column and are
 * left out.
 */
export function strongCsv(
  rows: readonly SessionExportRow[],
  options: { unit: WeightUnit; timeZone: string },
): string {
  const lines = [STRONG_CSV_HEADER.join(",")];
  let place = "";
  let working = 0;
  for (const row of rows) {
    const key = `${row.sessionId}|${row.exerciseKey}`;
    const first = key !== place;
    working = first ? 0 : working;
    place = key;
    const letter = SET_LETTER[row.kind];
    if (letter === undefined) working += 1;
    const weight =
      row.weightKg === null || options.unit === "kg" ? row.weightKg : row.weightKg / KG_PER_LB;
    lines.push(
      [
        localDateTime(row.startedAt, options.timeZone),
        csvCell(row.workout),
        strongDuration(row.sessionDurationS),
        csvCell(row.exercise),
        letter ?? String(working),
        number(weight, 2),
        number(row.reps, 0),
        number(row.distanceM, 1),
        number(row.durationS, 0),
        first ? csvCell(row.exerciseNote ?? "") : "",
        csvCell(row.sessionNote ?? ""),
        row.rpe === null ? "" : String(Number(row.rpe.toFixed(1))),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
