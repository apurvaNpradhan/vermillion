import {
  rpeToRir,
  type EffortScale,
  type SetKind,
  type WeightUnit,
} from "../vocabulary/vocabulary";
import { KG_PER_LB } from "../vocabulary/format";

/** One ticked set of a finished Session, with what the export writes of its Session and exercise. */
export type SessionExportRow = {
  sessionId: string;
  workout: string;
  /** ISO time the Session started. */
  startedAt: string;
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
  floors: number | null;
  steps: number | null;
  rpe: number | null;
};

/** The column titles, in order; the weight and effort titles follow the user's settings. */
export function sessionsCsvHeader(unit: WeightUnit, scale: EffortScale): string[] {
  return [
    "date",
    "workout",
    "exercise",
    "set",
    "kind",
    `weight_${unit}`,
    "reps",
    scale,
    "duration_seconds",
    "distance_meters",
    "floors",
    "steps",
    "workout_note",
    "exercise_note",
  ];
}

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
  value === null ? "" : String(Number(value.toFixed(digits)));

/** The local calendar date (`2026-11-20`) of an ISO time in a time zone. */
function localDate(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  return ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)?.value).join("-");
}

/**
 * Every finished Session as CSV (RFC 4180, CRLF line ends): one line per ticked set, in the order
 * given (oldest first). The weight is in the user's unit and the effort on their scale; the set
 * number counts every set of its exercise in that Session, warm-ups included.
 */
export function sessionsCsv(
  rows: readonly SessionExportRow[],
  options: { unit: WeightUnit; effortScale: EffortScale; timeZone: string },
): string {
  const lines = [sessionsCsvHeader(options.unit, options.effortScale).join(",")];
  let place = "";
  let setNumber = 0;
  for (const row of rows) {
    const key = `${row.sessionId}|${row.exerciseKey}`;
    setNumber = key === place ? setNumber + 1 : 1;
    place = key;
    const weight =
      row.weightKg === null
        ? ""
        : number(options.unit === "kg" ? row.weightKg : row.weightKg / KG_PER_LB, 2);
    const effort =
      row.rpe === null
        ? ""
        : number(options.effortScale === "rpe" ? row.rpe : rpeToRir(row.rpe), 1);
    lines.push(
      [
        localDate(row.startedAt, options.timeZone),
        csvCell(row.workout),
        csvCell(row.exercise),
        String(setNumber),
        row.kind,
        weight,
        number(row.reps, 0),
        effort,
        number(row.durationS, 0),
        number(row.distanceM, 1),
        number(row.floors, 0),
        number(row.steps, 0),
        csvCell(row.sessionNote ?? ""),
        csvCell(row.exerciseNote ?? ""),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
