import { SESSION_LIMITS, type SetKind, type WeightUnit } from "../vocabulary/vocabulary";
import { createCsvReader, detectDelimiter, type CsvDelimiter } from "./csv";

/** The apps whose CSV export can be imported. */
export type ImportFormat = "strong" | "hevy";

/** A date and time as the app wrote it, in the exporter's local time (no zone in the files). */
export type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** One set as the file records it, in the file's own units (weight in the file's unit). */
export type ImportedSet = {
  kind: SetKind;
  weight: number | null;
  reps: number | null;
  durationS: number | null;
  /** Meters. */
  distanceM: number | null;
  rpe: number | null;
};

/** An exercise's sets in one workout, in the file's own name for it. */
export type ImportedExercise = {
  name: string;
  note: string | null;
  /** Hevy's superset id (shared by the exercises of one superset), or null. */
  supersetKey: string | null;
  sets: ImportedSet[];
};

export type ImportedSession = {
  /** Unique within the file: the start text and the workout name. */
  key: string;
  title: string;
  start: WallClock;
  durationS: number | null;
  note: string | null;
  exercises: ImportedExercise[];
};

export type ParsedHistory = {
  format: ImportFormat;
  /** The unit the file names in its headers; null when it does not say (Strong's plain export). */
  weightUnit: WeightUnit | null;
  /** Oldest first. */
  sessions: ImportedSession[];
  /** Rows left out: an unreadable date or no exercise name. Rest timers are not counted. */
  skippedRows: number;
};

export type HistoryBuilderResult =
  | { ok: true; builder: HistoryBuilder }
  | { ok: false; reason: "unknown_format" };

export type HistoryBuilder = {
  format: ImportFormat;
  addRows(rows: readonly (readonly string[])[]): void;
  finish(): ParsedHistory;
};

const METERS_PER_MILE = 1609.344;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

type Column = { index: number; unit: string };

/** Header cell to its name without a unit, and the unit: `Weight (kg)` is `weight` and `kg`. */
function splitHeader(cell: string) {
  const clean = cell.replace(/^﻿/u, "").trim().toLowerCase();
  const unit = /\(([^)]*)\)/u.exec(clean)?.[1]?.trim() ?? "";
  return { key: clean.replace(/\([^)]*\)/gu, "").trim(), unit };
}

function readColumns(header: readonly string[]): Map<string, Column> {
  const columns = new Map<string, Column>();
  for (const [index, cell] of header.entries()) {
    const { key, unit } = splitHeader(cell);
    if (key !== "" && !columns.has(key)) columns.set(key, { index, unit });
  }
  return columns;
}

export function detectFormat(header: readonly string[]): ImportFormat | null {
  const columns = readColumns(header);
  if (columns.has("exercise_title") && columns.has("start_time")) return "hevy";
  if (columns.has("exercise name") && columns.has("date") && columns.has("set order"))
    return "strong";
  return null;
}

// ---- Cells ----

const cellOf = (row: readonly string[], column: Column | undefined) =>
  column === undefined ? "" : (row[column.index] ?? "").trim();

function parseNumber(text: string, delimiter: CsvDelimiter): number | null {
  if (text === "") return null;
  const value = Number(delimiter === "," ? text : text.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Strong writes a duration as `1h 5m`, `45m`, `30s`, `1:05:00` or plain seconds. */
export function parseDurationText(text: string, plainUnit: "s" | "min" = "s"): number | null {
  const clean = text.trim().toLowerCase();
  if (clean === "") return null;
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/u.exec(clean);
  if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const units = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?$/u.exec(clean);
  if (units && (units[1] ?? units[2] ?? units[3]) !== undefined) {
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
  }
  const plain = Number(clean.replace(",", "."));
  if (!Number.isFinite(plain) || plain < 0) return null;
  return Math.round(plainUnit === "min" ? plain * 60 : plain);
}

const TIME = String.raw`(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp][Mm])?)?`;
const ISO_DATE = new RegExp(String.raw`^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})${TIME}`, "u");
const DAY_MONTH_NAME = new RegExp(
  String.raw`^(\d{1,2})[ -]([A-Za-z]{3,9})\.?,?[ -](\d{4})${TIME}`,
  "u",
);
const MONTH_NAME_DAY = new RegExp(
  String.raw`^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})${TIME}`,
  "u",
);
const NUMERIC_DATE = new RegExp(String.raw`^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})${TIME}`, "u");

const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

function clock(
  parts: { year: number; month: number; day: number },
  time: readonly (string | undefined)[],
): WallClock | null {
  let hour = Number(time[0] ?? 0);
  const meridiem = time[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  const value: WallClock = {
    ...parts,
    hour,
    minute: Number(time[1] ?? 0),
    second: Number(time[2] ?? 0),
  };
  const valid =
    value.month >= 1 &&
    value.month <= 12 &&
    value.day >= 1 &&
    value.day <= 31 &&
    value.hour <= 23 &&
    value.minute <= 59 &&
    value.second <= 59;
  return valid ? value : null;
}

/** Whether a numeric date such as `03/04/2023` is written day first, from every date in a file. */
export function detectDayFirst(dates: Iterable<string>): boolean {
  for (const text of dates) {
    const match = NUMERIC_DATE.exec(text.trim());
    if (!match) continue;
    if (Number(match[1]) > 12) return true;
    if (Number(match[2]) > 12) return false;
  }
  return true;
}

/**
 * A date as Strong or Hevy writes it: `2023-01-15 10:30:00`, `15 Jan 2023, 10:30`,
 * `Jan 15, 2023 10:30`, or numeric `15/01/2023 10:30` (`dayFirst` decides `03/04/2023`).
 */
export function parseWallClock(text: string, dayFirst: boolean): WallClock | null {
  const value = text.trim();
  const iso = ISO_DATE.exec(value);
  if (iso) {
    return clock(
      { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) },
      iso.slice(4),
    );
  }
  const named = DAY_MONTH_NAME.exec(value);
  if (named) {
    const month = monthIndex(named[2] ?? "");
    return clock({ year: Number(named[3]), month, day: Number(named[1]) }, named.slice(4));
  }
  const reversed = MONTH_NAME_DAY.exec(value);
  if (reversed) {
    const month = monthIndex(reversed[1] ?? "");
    return clock({ year: Number(reversed[3]), month, day: Number(reversed[2]) }, reversed.slice(4));
  }
  const numeric = NUMERIC_DATE.exec(value);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return clock(
      dayFirst ? { year, month: second, day: first } : { year, month: first, day: second },
      numeric.slice(4),
    );
  }
  return null;
}

/** The instant of a wall-clock time in the device's time zone; null for a day that is not real. */
export function wallClockToIso(value: WallClock): string | null {
  const date = new Date(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
  );
  if (Number.isNaN(date.getTime()) || date.getDate() !== value.day) return null;
  return date.toISOString();
}

/** Effort as the app stores it: halves from 6 to 10; anything lower, or none, is no effort. */
export function normalizeEffort(value: number | null): number | null {
  if (value === null || value < 6) return null;
  return Math.min(10, Math.round(value * 2) / 2);
}

const clampNote = (text: string): string | null => {
  const note = text.trim();
  return note === "" ? null : note.slice(0, SESSION_LIMITS.noteMax);
};

// ---- Builders ----

type RawSession = {
  key: string;
  title: string;
  startText: string;
  endText: string | null;
  durationS: number | null;
  note: string | null;
  exercises: Map<string, ImportedExercise>;
};

type RowSet = {
  sessionKey: string;
  title: string;
  startText: string;
  endText: string | null;
  durationS: number | null;
  note: string | null;
  exercise: string;
  exerciseNote: string | null;
  supersetKey: string | null;
  set: ImportedSet | null;
};

const exerciseKey = (name: string) => name.trim().toLowerCase().replace(/\s+/gu, " ");

function weightUnitOf(text: string): WeightUnit | null {
  if (text === "kg" || text === "kgs") return "kg";
  if (text === "lb" || text === "lbs") return "lb";
  return null;
}

function distanceFactor(unit: string): number {
  if (unit === "km" || unit === "kilometers" || unit === "kilometres") return 1000;
  if (unit === "mi" || unit === "mile" || unit === "miles") return METERS_PER_MILE;
  return 1;
}

type RowReader = {
  weightUnit: WeightUnit | null;
  read(row: readonly string[]): RowSet | null | "rest";
};

function strongReader(columns: Map<string, Column>, delimiter: CsvDelimiter): RowReader {
  const weight = columns.get("weight");
  const duration = columns.get("duration");
  const factor = distanceFactor(columns.get("distance")?.unit ?? "");
  const durationUnit = duration?.unit.startsWith("min") ? "min" : "s";
  const number = (name: string, row: readonly string[]) =>
    parseNumber(cellOf(row, columns.get(name)), delimiter);
  return {
    weightUnit: weightUnitOf(weight?.unit ?? ""),
    read(row) {
      const order = cellOf(row, columns.get("set order")).toLowerCase();
      if (order.includes("rest")) return "rest";
      const name = cellOf(row, columns.get("exercise name"));
      const startText = cellOf(row, columns.get("date"));
      if (name === "" || startText === "") return null;
      const title = cellOf(row, columns.get("workout name"));
      const kind: SetKind =
        order === "w" ? "warmup" : order === "d" ? "drop" : order === "f" ? "failure" : "working";
      const distance = number("distance", row);
      return {
        sessionKey: `${startText}\u0000${title}`,
        title,
        startText,
        endText: null,
        durationS: parseDurationText(cellOf(row, duration), durationUnit),
        note: clampNote(cellOf(row, columns.get("workout notes"))),
        exercise: name,
        exerciseNote: clampNote(cellOf(row, columns.get("notes"))),
        supersetKey: null,
        set: {
          kind,
          weight: number("weight", row),
          reps: number("reps", row),
          durationS: number("seconds", row),
          distanceM: distance === null ? null : distance * factor,
          rpe: normalizeEffort(number("rpe", row)),
        },
      };
    },
  };
}

function hevyReader(columns: Map<string, Column>, delimiter: CsvDelimiter): RowReader {
  const kg = columns.get("weight_kg");
  const lb = columns.get("weight_lbs") ?? columns.get("weight_lb");
  const km = columns.get("distance_km");
  const miles = columns.get("distance_miles");
  const number = (column: Column | undefined, row: readonly string[]) =>
    parseNumber(cellOf(row, column), delimiter);
  return {
    weightUnit: kg ? "kg" : lb ? "lb" : null,
    read(row) {
      const name = cellOf(row, columns.get("exercise_title"));
      const startText = cellOf(row, columns.get("start_time"));
      if (name === "" || startText === "") return null;
      const title = cellOf(row, columns.get("title"));
      const type = cellOf(row, columns.get("set_type")).toLowerCase();
      const kind: SetKind =
        type === "warmup"
          ? "warmup"
          : type === "dropset"
            ? "drop"
            : type === "failure"
              ? "failure"
              : "working";
      const distanceKm = number(km, row);
      const distanceMiles = number(miles, row);
      const superset = cellOf(row, columns.get("superset_id"));
      return {
        sessionKey: `${startText}\u0000${title}`,
        title,
        startText,
        endText: cellOf(row, columns.get("end_time")) || null,
        durationS: null,
        note: clampNote(cellOf(row, columns.get("description"))),
        exercise: name,
        exerciseNote: clampNote(cellOf(row, columns.get("exercise_notes"))),
        supersetKey: superset === "" ? null : superset,
        set: {
          kind,
          weight: number(kg ?? lb, row),
          reps: number(columns.get("reps"), row),
          durationS: number(columns.get("duration_seconds"), row),
          distanceM:
            distanceKm !== null
              ? distanceKm * 1000
              : distanceMiles !== null
                ? distanceMiles * METERS_PER_MILE
                : null,
          rpe: normalizeEffort(number(columns.get("rpe"), row)),
        },
      };
    },
  };
}

/**
 * Starts reading a Strong or Hevy export from its header row. Feed it rows in slices with
 * `addRows` (so a big file does not block the UI), then `finish` to group them into workouts.
 */
export function createHistoryBuilder(
  header: readonly string[],
  delimiter: CsvDelimiter,
): HistoryBuilderResult {
  const format = detectFormat(header);
  if (format === null) return { ok: false, reason: "unknown_format" };
  const columns = readColumns(header);
  const reader =
    format === "hevy" ? hevyReader(columns, delimiter) : strongReader(columns, delimiter);
  const raw = new Map<string, RawSession>();
  let skippedRows = 0;

  const builder: HistoryBuilder = {
    format,
    addRows(rows) {
      for (const row of rows) {
        const read = reader.read(row);
        if (read === "rest") continue;
        if (read === null) {
          skippedRows += 1;
          continue;
        }
        let session = raw.get(read.sessionKey);
        if (!session) {
          session = {
            key: read.sessionKey,
            title: read.title,
            startText: read.startText,
            endText: read.endText,
            durationS: read.durationS,
            note: read.note,
            exercises: new Map(),
          };
          raw.set(read.sessionKey, session);
        }
        session.durationS ??= read.durationS;
        session.note ??= read.note;
        const key = exerciseKey(read.exercise);
        let exercise = session.exercises.get(key);
        if (!exercise) {
          exercise = {
            name: read.exercise.trim(),
            note: read.exerciseNote,
            supersetKey: read.supersetKey,
            sets: [],
          };
          session.exercises.set(key, exercise);
        }
        exercise.note ??= read.exerciseNote;
        if (read.set) exercise.sets.push(read.set);
      }
    },
    finish() {
      const sessions: ImportedSession[] = [];
      const dayFirst = detectDayFirst(raw.values().map((session) => session.startText));
      for (const session of raw.values()) {
        const start = parseWallClock(session.startText, dayFirst);
        if (!start) {
          skippedRows += session.exercises
            .values()
            .reduce((sum, item) => sum + item.sets.length, 0);
          continue;
        }
        let durationS = session.durationS;
        if (durationS === null && session.endText !== null) {
          const end = parseWallClock(session.endText, dayFirst);
          const from = wallClockToIso(start);
          const to = end ? wallClockToIso(end) : null;
          if (from !== null && to !== null) {
            const seconds = Math.round((Date.parse(to) - Date.parse(from)) / 1000);
            if (seconds >= 0) durationS = seconds;
          }
        }
        sessions.push({
          key: session.key,
          title: session.title,
          start,
          durationS,
          note: session.note,
          exercises: [...session.exercises.values()],
        });
      }
      sessions.sort((a, b) =>
        (wallClockToIso(a.start) ?? "").localeCompare(wallClockToIso(b.start) ?? ""),
      );
      return { format, weightUnit: reader.weightUnit, sessions, skippedRows };
    },
  };
  return { ok: true, builder };
}

export type ParseHistoryResult =
  | { ok: true; history: ParsedHistory }
  | { ok: false; reason: "unknown_format" | "empty" };

/** A whole export at once; the app reads large files in slices with {@link createHistoryBuilder}. */
export function parseHistoryCsv(text: string): ParseHistoryResult {
  const delimiter = detectDelimiter(text.replace(/^﻿/u, ""));
  const reader = createCsvReader(text, delimiter);
  const [header] = reader.readRows(1);
  if (!header) return { ok: false, reason: "empty" };
  const created = createHistoryBuilder(header, delimiter);
  if (!created.ok) return created;
  created.builder.addRows(reader.readRows(Number.POSITIVE_INFINITY));
  const history = created.builder.finish();
  return history.sessions.length === 0 ? { ok: false, reason: "empty" } : { ok: true, history };
}
