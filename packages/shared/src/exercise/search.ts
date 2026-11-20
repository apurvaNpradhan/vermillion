import { MUSCLE_DETAIL_ALIASES, MUSCLE_DETAIL_SLUGS, type MuscleDetail } from "./vocabulary";

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

/**
 * The muscle details a search word names: those with a word, in the name (the slug read as
 * words) or in an alias, that starts with it (so "rear" does not find "forearm"). Takes a word from `searchTokens` (escapes are undone) or a plain one.
 */
export function detailsMatching(token: string): MuscleDetail[] {
  const word = token.toLowerCase().replace(/\\([\\%_])/gu, "$1");
  if (word === "") return [];
  return MUSCLE_DETAIL_SLUGS.filter((detail) =>
    [detail.replaceAll("_", " "), ...MUSCLE_DETAIL_ALIASES[detail]].some((name) =>
      name.split(" ").some((part) => part.startsWith(word)),
    ),
  );
}

/** A `LIKE ... ESCAPE '\'` pattern that finds a detail slug inside a JSON array text. */
export function detailLikePattern(detail: MuscleDetail): string {
  return `%"${detail.replace(/[\\%_]/gu, "\\$&")}"%`;
}
