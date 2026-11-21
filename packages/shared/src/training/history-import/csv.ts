export const CSV_MAX_BYTES = 20 * 1024 * 1024;
const CSV_MAX_ROWS = 100_000;
const CSV_MAX_COLUMNS = 128;
const CSV_MAX_FIELD_LENGTH = 16_384;

export class HistoryCsvError extends Error {
  constructor(readonly reason: "csv_syntax" | "csv_limit") {
    super(reason);
  }
}

export function checkCsvSize(bytes: number) {
  if (bytes > CSV_MAX_BYTES) throw new HistoryCsvError("csv_limit");
}

/** The separators a spreadsheet export uses: comma, semicolon (comma-decimal locales) or tab. */
export type CsvDelimiter = "," | ";" | "\t";

const DELIMITERS: readonly CsvDelimiter[] = [",", ";", "\t"];

/** The delimiter used most on the header line outside quotes; a comma when none appears. */
export function detectDelimiter(text: string): CsvDelimiter {
  const end = text.search(/[\r\n]/u);
  const line = end === -1 ? text : text.slice(0, end);
  const counts = new Map<CsvDelimiter, number>(DELIMITERS.map((delimiter) => [delimiter, 0]));
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (!quoted) {
      for (const delimiter of DELIMITERS) {
        if (char === delimiter) counts.set(delimiter, (counts.get(delimiter) ?? 0) + 1);
      }
    }
  }
  let best: CsvDelimiter = ",";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = counts.get(delimiter) ?? 0;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/** An incremental reader: rows come in slices, so a large file can be read between UI frames. */
export type CsvReader = {
  readonly delimiter: CsvDelimiter;
  /** How much of the text has been read, 0 to 1. */
  progress(): number;
  done(): boolean;
  /** Up to `limit` further rows; a blank line is not a row. */
  readRows(limit: number): string[][];
};

/**
 * Reads RFC 4180 CSV: quoted fields may hold the delimiter, line breaks and `""` for a quote;
 * `\r\n`, `\n` and `\r` end a row; a leading byte order mark is ignored.
 */
export function createCsvReader(text: string, delimiter: CsvDelimiter = ","): CsvReader {
  let at = text.startsWith("﻿") ? 1 : 0;

  let rowCount = 0;

  function readRow(): string[] {
    const row: string[] = [];
    let field = "";
    let quoted = false;
    let closed = false;
    const append = (char: string) => {
      if (field.length >= CSV_MAX_FIELD_LENGTH) throw new HistoryCsvError("csv_limit");
      field += char;
    };
    const push = () => {
      if (row.length >= CSV_MAX_COLUMNS) throw new HistoryCsvError("csv_limit");
      row.push(field);
      field = "";
      closed = false;
    };
    while (at < text.length) {
      const char = text.charAt(at++);
      if (char === "\u0000") throw new HistoryCsvError("csv_syntax");
      if (quoted) {
        if (char !== '"') append(char);
        else if (text.charAt(at) === '"') {
          append('"');
          at += 1;
        } else {
          quoted = false;
          closed = true;
        }
      } else if (char === delimiter) {
        push();
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text.charAt(at) === "\n") at += 1;
        push();
        return row;
      } else if (char === '"' && field === "" && !closed) {
        quoted = true;
      } else if (closed || char === '"') {
        throw new HistoryCsvError("csv_syntax");
      } else append(char);
    }
    if (quoted) throw new HistoryCsvError("csv_syntax");
    push();
    return row;
  }

  return {
    delimiter,
    progress: () => (text.length === 0 ? 1 : Math.min(1, at / text.length)),
    done: () => at >= text.length,
    readRows(limit) {
      const rows: string[][] = [];
      while (rows.length < limit && at < text.length) {
        rowCount += 1;
        if (rowCount > CSV_MAX_ROWS) throw new HistoryCsvError("csv_limit");
        const row = readRow();
        if (row.length === 1 && row[0]?.trim() === "") continue;
        rows.push(row);
      }
      return rows;
    },
  };
}

/** Every row of a small text at once (tests, headers); large files use {@link createCsvReader}. */
export function parseCsvText(
  text: string,
  delimiter: CsvDelimiter = detectDelimiter(text),
): string[][] {
  return createCsvReader(text, delimiter).readRows(Number.POSITIVE_INFINITY);
}
