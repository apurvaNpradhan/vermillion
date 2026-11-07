import { getTableConfig, type SQLiteColumn, type SQLiteTable } from "drizzle-orm/sqlite-core";

/** A value as SQLite stores it (and as PowerSync hands it to the client). */
export type StorageValue = string | number | null;
export type StorageRow = Readonly<Record<string, StorageValue>>;

/** A JSON value, as carried by the upload contract. */
export type WireValue = string | number | boolean | null | WireValue[] | WireObject;
export type WireObject = { [key: string]: WireValue };
export type WireRow = Readonly<Record<string, WireValue>>;

/**
 * Storage to wire. The decoding follows the Drizzle column mode (boolean, timestamp, json), never
 * the column name: drizzle's own `mapFromDriverValue` gives the JS value, which is made JSON-safe.
 * Columns absent from the row stay absent (a PATCH carries only changed fields).
 */
export function storageRowToWire(table: SQLiteTable, row: StorageRow) {
  const wire: Record<string, WireValue> = {};
  for (const column of getTableConfig(table).columns) {
    const raw = row[column.name];
    if (raw === undefined) continue;
    wire[column.name] = raw === null ? null : toWireValue(column, raw);
  }
  return wire;
}

/** Wire to storage: the inverse of {@link storageRowToWire}. */
export function wireRowToStorage(table: SQLiteTable, row: WireRow) {
  const storage: Record<string, StorageValue> = {};
  for (const column of getTableConfig(table).columns) {
    const value = row[column.name];
    if (value === undefined) continue;
    storage[column.name] = value === null ? null : toStorageValue(column, value);
  }
  return storage;
}

function toWireValue(column: SQLiteColumn, raw: string | number): WireValue {
  const decoded = column.mapFromDriverValue(raw);
  if (decoded instanceof Date) return decoded.toISOString();
  if (column.columnType === "SQLiteBoolean") return Boolean(decoded);
  if (column.columnType === "SQLiteTextJson") return JSON.parse(String(raw));
  return raw;
}

function toStorageValue(column: SQLiteColumn, value: WireValue): StorageValue {
  switch (column.columnType) {
    case "SQLiteTimestamp":
      return Number(column.mapToDriverValue(new Date(String(value))));
    case "SQLiteBoolean":
      return Number(column.mapToDriverValue(Boolean(value)));
    case "SQLiteTextJson":
      return String(column.mapToDriverValue(value));
    default:
      if (value instanceof Object) return JSON.stringify(value);
      return value === true || value === false ? Number(value) : value;
  }
}
