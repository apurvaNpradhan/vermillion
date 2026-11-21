import { SESSION_LIMITS, type SetKind, type WeightUnit } from "../vocabulary/vocabulary";
import { checkCsvSize, createCsvReader, detectDelimiter, HistoryCsvError } from "./csv";
import { createImportClock, deviceTimeZone, wallClockMillis, type WallClock } from "./import-time";

export function wallClockToIso(value: WallClock): string | null {
  return createImportClock(deviceTimeZone())?.(value)?.iso ?? null;
}

/** The apps whose CSV export can be imported. */
export type ImportFormat = "strong" | "hevy";

/** One set as the file records it, in the file's own units (weight in the file's unit). */
export type ImportedSet = {
  kind: SetKind;
  weight: number | null;
  weightUnit?: WeightUnit | null;
  invalid?: boolean;
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
  startedAt: string;
  format: ImportFormat;
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
  dayFirst: boolean;
  ambiguousDates: boolean;
  gaps: number;
  overlaps: number;
};

export type HistoryBuilderResult =
  | { ok: true; builder: HistoryBuilder }
  | { ok: false; reason: "unknown_format" };

export type HistoryBuilder = {
  format: ImportFormat;
  addRows(rows: readonly (readonly string[])[]): void;
  finish(options?: { dayFirst?: boolean; timeZone?: string }): ParsedHistory;
};

const METERS_PER_MILE = 1609.344;
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

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

function parseNumber(text: string): number | null {
  if (!/^\d+(?:[.,]\d+)?$/u.test(text)) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

const setIndex = (text: string): number | null => (/^\d+$/u.test(text) ? parseNumber(text) : null);

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
  const plain = parseNumber(clean);
  if (plain === null) return null;
  return Math.round(plainUnit === "min" ? plain * 60 : plain);
}

const TIME = String.raw`(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?\s*([AaPp][Mm])?)?`;
const ISO_DATE = new RegExp(String.raw`^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})${TIME}$`, "u");
const DAY_MONTH_NAME = new RegExp(
  String.raw`^(\d{1,2})[ -]([A-Za-z]{3,9})\.?,?[ -](\d{4})${TIME}$`,
  "u",
);
const MONTH_NAME_DAY = new RegExp(
  String.raw`^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})${TIME}$`,
  "u",
);
const NUMERIC_DATE = new RegExp(
  String.raw`^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})${TIME}$`,
  "u",
);

const monthIndex = (name: string) =>
  MONTHS.findIndex(
    (month) => month === name.toLowerCase() || month.slice(0, 3) === name.toLowerCase(),
  ) + 1;

function clock(
  parts: { year: number; month: number; day: number },
  time: readonly (string | undefined)[],
): WallClock | null {
  let hour = Number(time[0] ?? 0);
  const meridiem = time[4]?.toLowerCase();
  if (meridiem && (hour < 1 || hour > 12)) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  const value: WallClock = {
    ...parts,
    hour,
    minute: Number(time[1] ?? 0),
    second: Number(time[2] ?? 0),
  };
  const millisecond = Number(time[3]?.padEnd(3, "0") ?? 0);
  if (millisecond > 0) value.millisecond = millisecond;
  return Number.isNaN(wallClockMillis(value)) ? null : value;
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
    const dayComesFirst = first > 12 || (second <= 12 && dayFirst);
    return clock(
      dayComesFirst ? { year, month: second, day: first } : { year, month: first, day: second },
      numeric.slice(4),
    );
  }
  return null;
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
  exercises: RawExercise[];
};

type RawExercise = Omit<ImportedExercise, "sets"> & {
  sourceIndex: string;
  firstIndexSeen: boolean;
  sets: { index: number | null; set: ImportedSet }[];
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
  index: number | null;
  sourceIndex: string;
  set: ImportedSet;
};

const exerciseKey = (name: string) => name.trim().toLowerCase().replace(/\s+/gu, " ");

function weightUnitOf(text: string): WeightUnit | null {
  if (["kg", "kgs", "kilogram", "kilograms"].includes(text)) return "kg";
  if (["lb", "lbs", "pound", "pounds"].includes(text)) return "lb";
  return null;
}

function distanceFactor(unit: string): number | null {
  if (["", "m", "meter", "meters", "metre", "metres"].includes(unit)) return 1;
  if (unit === "km" || unit === "kilometers" || unit === "kilometres") return 1000;
  if (unit === "mi" || unit === "mile" || unit === "miles") return METERS_PER_MILE;
  return null;
}

type RowReader = {
  weightUnit: WeightUnit | null;
  read(row: readonly string[]): RowSet | null | "rest";
};

function strongReader(columns: Map<string, Column>): RowReader {
  const weight = columns.get("weight");
  const duration = columns.get("workout duration") ?? columns.get("duration");
  const weightUnit = weightUnitOf(weight?.unit ?? "");
  const durationUnit = duration?.unit.startsWith("min") ? "min" : "s";
  const number = (name: string, row: readonly string[]) =>
    parseNumber(cellOf(row, columns.get(name)));
  return {
    weightUnit,
    read(row) {
      const order = cellOf(row, columns.get("set order")).toLowerCase();
      if (order.includes("rest")) return "rest";
      const name = cellOf(row, columns.get("exercise name"));
      const startText = cellOf(row, columns.get("date"));
      if (name === "" || startText === "") return null;
      const title = cellOf(row, columns.get("workout name"));
      const workoutId = cellOf(row, columns.get("workout id"));
      const kind: SetKind =
        order === "w" ? "warmup" : order === "d" ? "drop" : order === "f" ? "failure" : "working";
      const distance = number("distance", row);
      const distanceUnit = cellOf(row, columns.get("distance unit")).toLowerCase();
      const factor = distanceFactor(distanceUnit || columns.get("distance")?.unit || "");
      const unit = cellOf(row, columns.get("weight unit")).toLowerCase();
      const explicitUnit = weightUnitOf(unit);
      const rawWeight = number("weight", row);
      return {
        sessionKey: `${startText}\u0000${title}\u0000${workoutId}`,
        title,
        startText,
        endText: null,
        durationS: parseDurationText(cellOf(row, duration), durationUnit),
        note: clampNote(cellOf(row, columns.get("workout notes"))),
        exercise: name,
        exerciseNote: clampNote(cellOf(row, columns.get("notes"))),
        supersetKey: cellOf(row, columns.get("superset id")) || null,
        index: setIndex(order),
        sourceIndex: cellOf(row, columns.get("exercise index") ?? columns.get("exercise order")),
        set: {
          kind,
          weight: rawWeight,
          weightUnit: explicitUnit ?? weightUnit,
          invalid:
            (Boolean(unit) && explicitUnit === null && rawWeight !== null) ||
            (distance !== null && factor === null) ||
            ["weight", "reps", "seconds", "distance"].some(
              (name) => cellOf(row, columns.get(name)) !== "" && number(name, row) === null,
            ),
          reps: number("reps", row),
          durationS: number("seconds", row),
          distanceM: distance === null || factor === null ? null : distance * factor,
          rpe: normalizeEffort(number("rpe", row)),
        },
      };
    },
  };
}

function hevyReader(columns: Map<string, Column>): RowReader {
  const kg = columns.get("weight_kg");
  const lb = columns.get("weight_lbs") ?? columns.get("weight_lb");
  const km = columns.get("distance_km");
  const miles = columns.get("distance_miles");
  const number = (column: Column | undefined, row: readonly string[]) =>
    parseNumber(cellOf(row, column));
  return {
    weightUnit: kg ? "kg" : lb ? "lb" : null,
    read(row) {
      const name = cellOf(row, columns.get("exercise_title"));
      const startText = cellOf(row, columns.get("start_time"));
      if (name === "" || startText === "") return null;
      const title = cellOf(row, columns.get("title"));
      const workoutId = cellOf(row, columns.get("workout_id"));
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
        sessionKey: `${startText}\u0000${title}\u0000${workoutId}`,
        title,
        startText,
        endText: cellOf(row, columns.get("end_time")) || null,
        durationS: null,
        note: clampNote(cellOf(row, columns.get("description"))),
        exercise: name,
        exerciseNote: clampNote(cellOf(row, columns.get("exercise_notes"))),
        supersetKey: superset === "" ? null : superset,
        index: setIndex(cellOf(row, columns.get("set_index"))),
        sourceIndex: cellOf(row, columns.get("exercise_index")),
        set: {
          kind,
          weight: number(kg, row) ?? number(lb, row),
          weightUnit: number(kg, row) !== null ? "kg" : number(lb, row) !== null ? "lb" : null,
          invalid: [kg, lb, km, miles, columns.get("reps"), columns.get("duration_seconds")].some(
            (column) => cellOf(row, column) !== "" && number(column, row) === null,
          ),
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
export function createHistoryBuilder(header: readonly string[]): HistoryBuilderResult {
  const format = detectFormat(header);
  if (format === null) return { ok: false, reason: "unknown_format" };
  const columns = readColumns(header);
  const reader = format === "hevy" ? hevyReader(columns) : strongReader(columns);
  const raw: RawSession[] = [];
  const firstIndex = format === "hevy" ? 0 : 1;
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
        let session = raw.at(-1);
        if (!session || session.key !== read.sessionKey) {
          session = {
            key: read.sessionKey,
            title: read.title,
            startText: read.startText,
            endText: read.endText,
            durationS: read.durationS,
            note: read.note,
            exercises: [],
          };
          raw.push(session);
        }
        session.durationS ??= read.durationS;
        session.note ??= read.note;
        let exercise = session.exercises.at(-1);
        const reset = read.index === firstIndex && exercise?.firstIndexSeen && !read.sourceIndex;
        if (
          !exercise ||
          reset ||
          exerciseKey(exercise.name) !== exerciseKey(read.exercise) ||
          (exercise.sourceIndex && read.sourceIndex && exercise.sourceIndex !== read.sourceIndex) ||
          (exercise.supersetKey !== null &&
            read.supersetKey !== null &&
            exercise.supersetKey !== read.supersetKey)
        ) {
          exercise = {
            name: read.exercise,
            note: read.exerciseNote,
            supersetKey: read.supersetKey,
            sourceIndex: read.sourceIndex,
            firstIndexSeen: false,
            sets: [],
          };
          session.exercises.push(exercise);
        }
        exercise.note ??= read.exerciseNote;
        exercise.supersetKey ??= read.supersetKey;
        if (!exercise.sourceIndex) exercise.sourceIndex = read.sourceIndex;
        exercise.firstIndexSeen ||= read.index === firstIndex;
        exercise.sets.push({ index: read.index, set: read.set });
      }
    },
    finish(options) {
      const sessions: ImportedSession[] = [];
      const dates = raw
        .values()
        .flatMap((session) => [session.startText, session.endText ?? ""])
        .toArray();
      const dayFirst = options?.dayFirst ?? detectDayFirst(dates);
      const ambiguousDates = dates.some((text) => {
        const match = NUMERIC_DATE.exec(text);
        return (
          match !== null &&
          Number(match[1]) !== Number(match[2]) &&
          Number(match[1]) <= 12 &&
          Number(match[2]) <= 12
        );
      });
      const toInstant = createImportClock(options?.timeZone ?? deviceTimeZone());
      if (!toInstant) throw new RangeError("Invalid source time zone");
      let unreadable = skippedRows;
      let gaps = 0;
      let overlaps = 0;
      for (const session of raw) {
        const start = parseWallClock(session.startText, dayFirst);
        const end = session.endText !== null ? parseWallClock(session.endText, dayFirst) : null;
        if (!start || (session.endText !== null && !end)) {
          unreadable += session.exercises.reduce((sum, item) => sum + item.sets.length, 0);
          continue;
        }
        const from = toInstant(start);
        const to = end ? toInstant(end) : null;
        if (!from || (end && !to)) {
          gaps += 1;
          continue;
        }
        if (from.overlap || to?.overlap) overlaps += 1;
        const seconds = to ? Math.round((Date.parse(to.iso) - Date.parse(from.iso)) / 1000) : null;
        sessions.push({
          key: session.key,
          format,
          title: session.title,
          start,
          startedAt: from.iso,
          durationS: session.durationS ?? (seconds !== null && seconds >= 0 ? seconds : null),
          note: session.note,
          exercises: session.exercises.map(({ name, note, supersetKey, sets }) => {
            // Sort the indexed slots and retain the file positions of unindexed sets.
            const indexed = sets
              .flatMap(({ index, set }) => (index === null ? [] : [{ index, set }]))
              .sort((a, b) => a.index - b.index)
              .values();
            return {
              name,
              note,
              supersetKey,
              sets: sets.map(({ index, set }) =>
                index === null ? set : (indexed.next().value?.set ?? set),
              ),
            };
          }),
        });
      }
      sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      return {
        format,
        weightUnit: reader.weightUnit,
        sessions,
        skippedRows: unreadable,
        dayFirst,
        ambiguousDates,
        gaps,
        overlaps,
      };
    },
  };
  return { ok: true, builder };
}

export type ParseHistoryResult =
  | { ok: true; history: ParsedHistory }
  | { ok: false; reason: "unknown_format" | "empty" | HistoryCsvError["reason"] };

/** A whole export at once; the app reads large files in slices with {@link createHistoryBuilder}. */
export function parseHistoryCsv(
  text: string,
  options?: Parameters<HistoryBuilder["finish"]>[0],
): ParseHistoryResult {
  try {
    checkCsvSize(new TextEncoder().encode(text).length);
    const reader = createCsvReader(text, detectDelimiter(text));
    const [header] = reader.readRows(1);
    if (!header) return { ok: false, reason: "empty" };
    const created = createHistoryBuilder(header);
    if (!created.ok) return created;
    created.builder.addRows(reader.readRows(Number.POSITIVE_INFINITY));
    const history = created.builder.finish(options);
    return history.sessions.length === 0 && history.gaps === 0
      ? { ok: false, reason: "empty" }
      : { ok: true, history };
  } catch (error) {
    if (error instanceof HistoryCsvError) return { ok: false, reason: error.reason };
    throw error;
  }
}
