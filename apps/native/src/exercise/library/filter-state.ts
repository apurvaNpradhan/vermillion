import { DEFAULT_LIBRARY_FILTERS, type LibraryFilters } from "@workspace/sync";

/** `values` with `value` added, or removed when it is already there. */
export function toggled<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/** The filters with every facet cleared; the search text and the sort stay. */
export function withoutFacets(filters: LibraryFilters): LibraryFilters {
  return {
    ...filters,
    muscles: DEFAULT_LIBRARY_FILTERS.muscles,
    includeSecondary: DEFAULT_LIBRARY_FILTERS.includeSecondary,
    equipment: DEFAULT_LIBRARY_FILTERS.equipment,
    show: DEFAULT_LIBRARY_FILTERS.show,
  };
}

/** Splits `items` into rows of `size`, for a grid laid out as rows of equal cells. */
export function chunked<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, row) =>
    items.slice(row * size, row * size + size),
  );
}
