import { hasActiveFilters, type LibraryFilters } from "@workspace/sync";

export type LibraryFilterState = Omit<LibraryFilters, "lacking"> & { availableOnly: boolean };

export function hasActiveFacets(filters: LibraryFilterState): boolean {
  return filters.availableOnly || hasActiveFilters({ ...filters, lacking: [] });
}

/** `values` with `value` added, or removed when it is already there. */
export function toggled<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/** The filters with every facet cleared; the search text and the sort stay. */
export function withoutFacets(filters: LibraryFilterState): LibraryFilterState {
  return {
    ...filters,
    muscles: [],
    primaryDetail: null,
    pinnedOnly: false,
    includeSecondary: false,
    equipment: [],
    availableOnly: false,
    show: "all",
  };
}

/** Splits `items` into rows of `size`, for a grid laid out as rows of equal cells. */
export function chunked<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, row) =>
    items.slice(row * size, row * size + size),
  );
}
