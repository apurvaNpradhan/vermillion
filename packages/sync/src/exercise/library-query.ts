import { searchTokens, type Equipment, type MuscleGroup } from "@workspace/shared";

/** Which exercises the library lists: the catalog and Custom exercises, only Custom, or archived Custom. */
export const LIBRARY_SHOW = ["all", "custom", "archived"] as const;
export type LibraryShow = (typeof LIBRARY_SHOW)[number];

/** The order of the list when there is no search: by name, or by popularity. */
export const LIBRARY_SORT = ["az", "popular"] as const;
export type LibrarySort = (typeof LIBRARY_SORT)[number];

export type LibraryFilters = {
  search: string;
  muscles: readonly MuscleGroup[];
  /** Also match exercises that use a chosen muscle group as a secondary one. */
  includeSecondary: boolean;
  equipment: readonly Equipment[];
  show: LibraryShow;
  sort: LibrarySort;
};

export const DEFAULT_LIBRARY_FILTERS = {
  search: "",
  muscles: [],
  includeSecondary: false,
  equipment: [],
  show: "all",
  sort: "az",
} as const satisfies LibraryFilters;

export type LibraryParam = string | number;
export type LibraryQuery = { sql: string; params: LibraryParam[] };

/** The columns a row of the list needs. */
export const LIBRARY_ROW_COLUMNS =
  "id, user_id, title, primary_muscle, equipment, thumbnail_key, retired_at";

/** Whether any filter beyond the search text is set. */
export function hasActiveFilters(filters: LibraryFilters): boolean {
  return filters.muscles.length > 0 || filters.equipment.length > 0 || filters.show !== "all";
}

function placeholders(values: readonly string[]): string {
  return values.map(() => "?").join(", ");
}

const LIKE = "LIKE ? ESCAPE '\\'";

/** The WHERE clause and its parameters; one source for the list and the count. */
type WhereClause = { where: string; params: LibraryParam[] };

function whereClause(filters: LibraryFilters): WhereClause {
  const clauses: string[] = [];
  const params: LibraryParam[] = [];

  if (filters.show === "archived") clauses.push("user_id IS NOT NULL AND retired_at IS NOT NULL");
  else if (filters.show === "custom") clauses.push("user_id IS NOT NULL AND retired_at IS NULL");
  else clauses.push("retired_at IS NULL");

  for (const token of searchTokens(filters.search)) {
    clauses.push(`(title ${LIKE} OR aka ${LIKE} OR search_terms ${LIKE})`);
    const pattern = `%${token}%`;
    params.push(pattern, pattern, pattern);
  }

  if (filters.muscles.length > 0) {
    const list = placeholders(filters.muscles);
    if (filters.includeSecondary) {
      clauses.push(
        `(primary_muscle IN (${list}) OR EXISTS (SELECT 1 FROM json_each(exercise.secondary_muscles) WHERE value IN (${list})))`,
      );
      params.push(...filters.muscles, ...filters.muscles);
    } else {
      clauses.push(`primary_muscle IN (${list})`);
      params.push(...filters.muscles);
    }
  }

  if (filters.equipment.length > 0) {
    clauses.push(`equipment IN (${placeholders(filters.equipment)})`);
    params.push(...filters.equipment);
  }

  return { where: clauses.join(" AND "), params };
}

/**
 * The list query. Words of the search are AND-ed over title, aka and search terms; the values of
 * one facet are OR-ed and the facets AND-ed. Order: with a search, titles that start with it,
 * then rank (high first), title, id; without one, A-Z (title, id) or Popular (rank, title, id).
 * `limit` bounds the window. Every value is a bound parameter.
 */
export function libraryQuery(filters: LibraryFilters, limit: number): LibraryQuery {
  const { where, params } = whereClause(filters);
  const tokens = searchTokens(filters.search);
  const orderParams: LibraryParam[] = [];
  let order: string;
  if (tokens.length > 0) {
    order = `CASE WHEN lower(title) ${LIKE} THEN 0 ELSE 1 END, rank DESC, title COLLATE NOCASE, id`;
    orderParams.push(`${tokens.join(" ")}%`);
  } else if (filters.sort === "popular") {
    order = "rank DESC, title COLLATE NOCASE, id";
  } else {
    order = "title COLLATE NOCASE, id";
  }
  return {
    sql: `SELECT ${LIBRARY_ROW_COLUMNS} FROM exercise WHERE ${where} ORDER BY ${order} LIMIT ?`,
    params: [...params, ...orderParams, limit],
  };
}

/** How many exercises match the filters, ignoring the window. */
export function libraryCountQuery(filters: LibraryFilters): LibraryQuery {
  const { where, params } = whereClause(filters);
  return { sql: `SELECT COUNT(*) AS total FROM exercise WHERE ${where}`, params };
}
