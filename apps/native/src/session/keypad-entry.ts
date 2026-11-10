import {
  KG_PER_LB,
  MAX_WEIGHT_KG,
  SESSION_LIMITS,
  formatWeight,
  parseWeight,
  type SetField,
  type WeightUnit,
} from "@workspace/shared";

const MAX_DURATION_SECONDS = SESSION_LIMITS.durationMaxSeconds;

import type { KeypadKey } from "../platform/ui/keypad-keys";
import { formatElapsed } from "./clock";

/** A key of the keypad that edits the text of a cell. */
export type EntryKey = KeypadKey;

/** The cells the keypad types into: the fields of `SET_FIELDS`. Effort has its own sheet. */
export type EntryField = SetField;

const MAX_REPS = 999;
const MAX_FLOORS = 10_000;
const MAX_STEPS = 1_000_000;
const MAX_DISTANCE_M = 1_000_000;
const MAX_DURATION_DIGITS = 6;

/**
 * Duration is typed like a microwave: the last two digits are seconds and the rest are minutes,
 * so 1, 3, 0 reads 1:30 and 4, 5 reads 0:45. The text of a duration cell is that digit string.
 */
export function durationFromDigits(digits: string): number | null {
  if (digits === "") return null;
  const total = secondsOfDigits(digits);
  return total === 0 ? null : Math.min(MAX_DURATION_SECONDS, total);
}

/** What the digits read as, before the 24 h cap. */
function secondsOfDigits(digits: string): number {
  const padded = digits.padStart(3, "0");
  return Number(padded.slice(0, -2)) * 60 + Number(padded.slice(-2));
}

/** The digit string a duration is edited from (the inverse of {@link durationFromDigits}). */
export function digitsFromDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes === 0 ? String(rest) : `${minutes}${String(rest).padStart(2, "0")}`;
}

/** The text a cell starts editing from: the stored value in the user's unit. */
export function textOfValue(field: EntryField, value: number | null, unit: WeightUnit): string {
  if (value === null) return "";
  switch (field) {
    case "weight":
      return formatWeight(value, unit);
    case "duration":
      return digitsFromDuration(value);
    case "distance":
      return String(Number(value.toFixed(1)));
    case "reps":
    case "floors":
    case "steps":
      return String(Math.round(value));
  }
}

/**
 * The value the text means, in storage units (kg, seconds, metres, counts); null when empty (the
 * cell is cleared). Text a key press could never produce is also null.
 */
export function valueOfText(field: EntryField, text: string, unit: WeightUnit): number | null {
  const cleaned = text.endsWith(".") ? text.slice(0, -1) : text;
  if (cleaned === "") return null;
  switch (field) {
    case "weight":
      return parseWeight(cleaned, unit);
    case "duration":
      return durationFromDigits(cleaned);
    case "distance":
      return Number.isFinite(Number(cleaned)) ? Number(cleaned) : null;
    case "reps":
    case "floors":
    case "steps": {
      // A count of 0 is no value: the cell reads as empty, as when it was cleared.
      const value = Number(cleaned);
      return Number.isFinite(value) && value > 0 ? value : null;
    }
  }
}

function withinLimit(field: EntryField, text: string, unit: WeightUnit): boolean {
  const cleaned = text.endsWith(".") ? text.slice(0, -1) : text;
  if (cleaned === "") return true;
  switch (field) {
    case "weight":
      return /^\d{1,4}(\.\d{0,2})?$/.test(text) && parseWeight(cleaned, unit) !== null;
    case "reps":
      return /^\d{1,3}$/.test(text) && Number(text) <= MAX_REPS;
    case "floors":
      return /^\d{1,5}$/.test(text) && Number(text) <= MAX_FLOORS;
    case "steps":
      return /^\d{1,7}$/.test(text) && Number(text) <= MAX_STEPS;
    case "distance":
      return /^\d{1,7}(\.\d?)?$/.test(text) && Number(cleaned) <= MAX_DISTANCE_M;
    case "duration":
      return (
        /^\d+$/.test(text) &&
        text.length <= MAX_DURATION_DIGITS &&
        secondsOfDigits(text) <= MAX_DURATION_SECONDS
      );
  }
}

/** What a cell shows for the text being typed: a duration reads as 1:30, the rest as typed. */
export function displayOfText(field: EntryField, text: string): string {
  if (field !== "duration") return text;
  const seconds = durationFromDigits(text);
  return seconds === null ? "" : formatElapsed(seconds);
}

/** Whether a field accepts a decimal point. */
export function allowsPoint(field: EntryField): boolean {
  return field === "weight" || field === "distance";
}

/**
 * The text after a key press. A key that would make an invalid text (a second point, 1,000 reps,
 * a weight over the cap) leaves it as it was; a leading zero never stays in front of a digit.
 */
export function applyKey(field: EntryField, text: string, key: EntryKey, unit: WeightUnit): string {
  if (key === "backspace") return text.slice(0, -1);
  if (key === ".") {
    if (!allowsPoint(field) || text.includes(".")) return text;
    const next = text === "" ? "0." : `${text}.`;
    return withinLimit(field, next, unit) ? next : text;
  }
  const base = text === "0" && field !== "duration" ? "" : text;
  const next = `${base}${key}`;
  if (field === "duration" && next.replace(/^0+/, "") === "") return "";
  const trimmed = field === "duration" ? next.replace(/^0+/, "") : next;
  return withinLimit(field, trimmed, unit) ? trimmed : text;
}

export type StepContext = { unit: WeightUnit; barbell: boolean };

/** The step of the − and + keys for a field: the weight by equipment and unit, the rest fixed. */
export function stepOf(field: EntryField, context: StepContext): number {
  switch (field) {
    case "weight":
      if (context.barbell) return context.unit === "kg" ? 2.5 : 5;
      return context.unit === "kg" ? 1 : 2.5;
    case "reps":
      return 1;
    case "duration":
      return 5;
    case "distance":
      return 10;
    case "floors":
      return 1;
    case "steps":
      return 10;
  }
}

const MINIMUM = {
  weight: 0,
  reps: 1,
  duration: 1,
  distance: 0,
  floors: 1,
  steps: 1,
} as const satisfies Record<EntryField, number>;
const MAXIMUM = {
  weight: MAX_WEIGHT_KG,
  reps: MAX_REPS,
  duration: MAX_DURATION_SECONDS,
  distance: MAX_DISTANCE_M,
  floors: MAX_FLOORS,
  steps: MAX_STEPS,
} as const satisfies Record<EntryField, number>;

/**
 * The value after − or + (`direction` −1 or 1), starting from the cell's value or, when empty,
 * its Ghost, else zero. A weight steps in the user's unit (2.5 kg / 5 lb on a barbell, 1 kg /
 * 2.5 lb otherwise) and comes back in kg; every field stays within its allowed range.
 */
export function stepValue(
  field: EntryField,
  current: number | null,
  ghost: number | null,
  direction: 1 | -1,
  context: StepContext,
): number {
  const start = current ?? ghost ?? 0;
  const step = stepOf(field, context);
  let next: number;
  if (field === "weight") {
    const shown = context.unit === "kg" ? start : start / KG_PER_LB;
    const stepped = Math.round((shown + direction * step) / step) * step;
    next = parseWeight(String(Number(Math.max(0, stepped).toFixed(2))), context.unit) ?? 0;
  } else {
    next = start + direction * step;
  }
  return Math.min(MAXIMUM[field], Math.max(MINIMUM[field], next));
}

/** A cell the keypad can address. */
export type CellRef = { setId: string; field: EntryField };

/** One set's place in the order Next walks: which exercise it is in and where. */
export type CellSet = { id: string; fields: readonly EntryField[] };
export type CellExercise = { id: string; sets: readonly CellSet[] };

/**
 * The order Next walks through a block's cells. A lone exercise: weight → reps → the next set's
 * weight. A superset goes by rounds (A1, B1, A2, B2), so Next follows the logging order.
 */
export function cellOrder(members: readonly CellExercise[]): CellRef[] {
  const rounds = Math.max(0, ...members.map((member) => member.sets.length));
  const cells: CellRef[] = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const member of members) {
      const set = member.sets[round];
      if (set) for (const field of set.fields) cells.push({ setId: set.id, field });
    }
  }
  return cells;
}

/** The cell after `current`, or null at the end (Next then has nowhere to go). */
export function nextCell(cells: readonly CellRef[], current: CellRef): CellRef | null {
  const at = cells.findIndex(
    (cell) => cell.setId === current.setId && cell.field === current.field,
  );
  return at < 0 ? null : (cells[at + 1] ?? null);
}
