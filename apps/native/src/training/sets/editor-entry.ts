import type { Equipment, SetField, WeightUnit } from "@workspace/shared";

import {
  applyKey,
  displayOfText,
  stepValue,
  textOfValue,
  valueOfText,
  type EntryKey,
} from "../../platform/ui/keypad-entry";

/** The columns of the Workout editor's set table that the keypad types into (reps and effort open pickers). */
export type EditorField = Extract<
  SetField,
  "weight" | "duration" | "distance" | "floors" | "steps"
>;

/** What the editor keypad needs to know about the cell being edited. */
export type EditorCell = {
  /** Unique among the cells of one table: the set's draft id and the column. */
  key: string;
  field: EditorField;
  /** "Set 2 weight (kg)", for the strip above the keys. */
  label: string;
  /** The planned value now; undefined when empty. */
  value: number | undefined;
  unit: WeightUnit;
  equipment: Equipment | null;
  incrementKg: number | null;
  onValue: (value: number | undefined) => void;
};

/** What the keypad is doing: the cell being edited and the text typed into it. */
export type EditorEntry = { cell: EditorCell; raw: string; fresh: boolean };

/** Starts editing a cell: its value as text; the first key replaces it. */
export function openEntry(cell: EditorCell): EditorEntry {
  return {
    cell,
    raw: textOfValue(cell.field, cell.value ?? null, cell.unit),
    fresh: true,
  };
}

/** What the cell shows while it is being edited (a duration reads as 1:30). */
export function entryDisplay(entry: EditorEntry): string {
  return displayOfText(entry.cell.field, entry.raw);
}

/**
 * A key press: the new entry and the value to write (`undefined` clears the target). A key that
 * would make an invalid text changes nothing and writes nothing (`write: false`).
 */
export type KeyResult = { entry: EditorEntry; write: boolean; value: number | undefined };
export function pressKey(entry: EditorEntry, key: EntryKey): KeyResult {
  const { cell } = entry;
  const base = entry.fresh ? "" : entry.raw;
  const raw = entry.fresh && key === "backspace" ? "" : applyKey(cell.field, base, key, cell.unit);
  if (raw === entry.raw && !entry.fresh) return { entry, write: false, value: cell.value };
  return {
    entry: { cell, raw, fresh: false },
    write: true,
    value: valueOfText(cell.field, raw, cell.unit) ?? undefined,
  };
}

/** The − and + keys: step from what is typed, else the planned value, else zero. */
export type StepResult = { entry: EditorEntry; value: number };
export function pressStep(entry: EditorEntry, direction: 1 | -1): StepResult {
  const { cell } = entry;
  const typed = entry.fresh ? (cell.value ?? null) : valueOfText(cell.field, entry.raw, cell.unit);
  const value = stepValue(cell.field, typed, null, direction, {
    unit: cell.unit,
    equipment: cell.equipment,
    incrementKg: cell.incrementKg,
  });
  return {
    entry: { cell, raw: textOfValue(cell.field, value, cell.unit), fresh: false },
    value,
  };
}

/** The cell Next goes to: the one after `key` in the table's order, or null at the end. */
export function nextEditorCell(cells: readonly EditorCell[], key: string): EditorCell | null {
  const at = cells.findIndex((cell) => cell.key === key);
  return at < 0 ? null : (cells[at + 1] ?? null);
}

/**
 * Forgets the cells of a table that is gone (its exercise collapsed or its screen closed) and says
 * whether the keypad was editing one of them, so it must close.
 */
export function unbindTable(
  tables: Map<string, readonly EditorCell[]>,
  activeTableId: string | null,
  tableId: string,
): boolean {
  tables.delete(tableId);
  return activeTableId === tableId;
}
