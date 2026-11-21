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

  function readRow(): string[] {
    const row: string[] = [];
    let field = "";
    let quoted = false;
    while (at < text.length) {
      const char = text.charAt(at);
      if (quoted) {
        if (char === '"') {
          if (text.charAt(at + 1) === '"') {
            field += '"';
            at += 2;
            continue;
          }
          quoted = false;
        } else field += char;
        at += 1;
        continue;
      }
      if (char === '"' && field === "") quoted = true;
      else if (char === delimiter) {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        at += char === "\r" && text.charAt(at + 1) === "\n" ? 2 : 1;
        row.push(field);
        return row;
      } else field += char;
      at += 1;
    }
    row.push(field);
    return row;
  }

  return {
    delimiter,
    progress: () => (text.length === 0 ? 1 : Math.min(1, at / text.length)),
    done: () => at >= text.length,
    readRows(limit) {
      const rows: string[][] = [];
      while (rows.length < limit && at < text.length) {
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
