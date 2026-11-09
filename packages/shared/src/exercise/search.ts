/**
 * The words of a search query, ready for `LIKE ... ESCAPE '\'`: lowercased, split on whitespace,
 * empties dropped, and `%`, `_` and `\` escaped so they match themselves.
 */
export function searchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== "")
    .map((word) => word.replace(/[\\%_]/gu, "\\$&"));
}
