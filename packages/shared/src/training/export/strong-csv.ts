import type { SetKind } from "../vocabulary/vocabulary";

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
 * Strong's comma-delimited export layout. The unitless Weight column contains kilograms, as
 * Hevy's Strong importer expects. Distance is in metres and Seconds is for a timed set.
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
 * `-`, `@`, tab or a line break) is prefixed with an apostrophe. Strong quotes text cells
 * and doubles any quotation marks inside them.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

const number = (value: number | null) => String(value ?? 0);

/** The local wall-clock time of an ISO time in a time zone, as Strong writes it: `2026-11-20 18:30:00`. */
function localDateTime(iso: string, formatter: Intl.DateTimeFormat): string {
  const parts = formatter.formatToParts(new Date(iso));
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
 * is the RPE. Workout and exercise notes appear on their respective first lines.
 * The date is local to `timeZone`.
 * Strong's set-based CSV has no columns for floors, steps or empty workouts.
 */
export function strongCsv(
  rows: readonly SessionExportRow[],
  options: { timeZone: string },
): string {
  const lines = [STRONG_CSV_HEADER.join(",")];
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: options.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let sessionId: string | undefined;
  let date = "";
  let place = "";
  let working = 0;
  for (const row of rows) {
    const firstSet = row.sessionId !== sessionId;
    if (firstSet) {
      sessionId = row.sessionId;
      date = localDateTime(row.startedAt, formatter);
    }
    const key = `${row.sessionId}|${row.exerciseKey}`;
    const first = key !== place;
    working = first ? 0 : working;
    place = key;
    const letter = SET_LETTER[row.kind];
    if (letter === undefined) working += 1;
    lines.push(
      [
        date,
        csvCell(row.workout),
        strongDuration(row.sessionDurationS),
        csvCell(row.exercise),
        letter ?? String(working),
        number(row.weightKg),
        number(row.reps),
        number(row.distanceM),
        number(row.durationS),
        first ? csvCell(row.exerciseNote ?? "") : "",
        firstSet ? csvCell(row.sessionNote ?? "") : "",
        row.rpe === null ? "" : String(row.rpe),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
