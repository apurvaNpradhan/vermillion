/**
 * What typing into a set cell means, shared by the Session's keypad and the Workout editor's:
 * the text of a cell, the value it reads as, which keys are valid, and the − / + steps.
 */
import {
  KG_PER_LB,
  addLoad,
  incrementFor,
  loadGridOf,
  weightAtMost,
  type LoadGrid,
  type Equipment,
  MAX_WEIGHT_KG,
  SESSION_LIMITS,
  formatWeight,
  parseWeight,
  type SetField,
  type WeightUnit,
} from "@workspace/shared";

const MAX_DURATION_SECONDS = SESSION_LIMITS.durationMaxSeconds;

import type { KeypadKey } from "./keypad-keys";

/** "0:05", "12:30", "1:02:03": minutes and seconds, with hours once there are any. */
function formatElapsed(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(whole % 60)}`
    : `${minutes}:${pad(whole % 60)}`;
}

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

export type StepContext = {
  unit: WeightUnit;
  /** The exercise's equipment; null when unknown (steps like "other"). */
  equipment: Equipment | null;
  /** The user's manual weight increment in kg; null is "Auto by equipment". */
  incrementKg: number | null;
  grid?: LoadGrid | null;
};

/**
 * The step of the − and + keys for a field. A weight steps by the manual increment, else by the
 * equipment's smallest loadable step (the same rule the progression suggestions use), shown in the
 * user's unit; the rest are fixed.
 */
export function stepOf(
  field: EntryField,
  context: StepContext,
  loadKg: number | null = null,
): number {
  switch (field) {
    case "weight": {
      const kg = incrementFor(
        loadKg,
        context.equipment ?? "other",
        {
          weightUnit: context.unit,
          weightIncrementKg: context.incrementKg,
        },
        context.grid,
      );
      return Number((context.unit === "kg" ? kg : kg / KG_PER_LB).toFixed(2));
    }
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
 * its Ghost, else zero. A weight steps in the user's unit (see {@link stepOf}) and comes back in kg; every field stays within its allowed range.
 */
export function stepValue(
  field: EntryField,
  current: number | null,
  ghost: number | null,
  direction: 1 | -1,
  context: StepContext,
): number {
  const start = current ?? ghost ?? 0;
  const step = stepOf(
    field,
    context,
    field === "weight" && (context.grid || context.equipment === "dumbbell") ? start : null,
  );
  let next: number;
  if (field === "weight") {
    const grid =
      context.grid ??
      (context.equipment === "dumbbell"
        ? loadGridOf({ equipment: "dumbbell", unit: context.unit })
        : null);
    const cap = Math.min(grid?.capKg ?? MAX_WEIGHT_KG, MAX_WEIGHT_KG);
    if (grid && (grid.source === "gym" || context.incrementKg === null)) {
      // A typed pound weight is rounded to grams. Walk down from its matching rack point.
      const nearestToStart = direction === -1 ? grid.nearest(start) : start;
      const atGridPoint =
        formatWeight(nearestToStart, context.unit) === formatWeight(start, context.unit);
      const below = direction === -1 ? grid.below(atGridPoint ? nearestToStart : start) : null;
      const stepKg = incrementFor(
        below ?? start,
        context.equipment ?? "other",
        {
          weightUnit: context.unit,
          weightIncrementKg: context.incrementKg,
        },
        grid,
      );
      if (direction === 1) {
        const next = addLoad(start, stepKg, context.unit, grid) ?? start;
        return next > cap ? weightAtMost(next, context.unit, cap) : next;
      }
      if (grid.source !== "cap") {
        const nearest = grid.nearest(Math.max(0, start - stepKg));
        const lighter = nearest < start ? nearest : (below ?? 0);
        return weightAtMost(lighter, context.unit, Math.min(cap, start));
      }
    }
    const shown = context.unit === "kg" ? start : start / KG_PER_LB;
    const stepped = Math.round((shown + direction * step) / step) * step;
    next = weightAtMost(
      Math.max(0, context.unit === "kg" ? stepped : stepped * KG_PER_LB),
      context.unit,
      cap,
    );
  } else {
    next = start + direction * step;
  }
  return Math.min(MAXIMUM[field], Math.max(MINIMUM[field], next));
}
