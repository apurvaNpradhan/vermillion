/** Splits a comma-separated environment value into trimmed, non-empty entries. */
export function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
