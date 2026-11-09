import { LIBRARY_SORT, type LibrarySort } from "@workspace/sync";

/** Device-storage key of the remembered sort (letters, digits and `.-_` only). */
export const SORT_KEY = "exercise.sort";

/** The remembered sort; anything stored that is not a known sort falls back to A-Z. */
export function parseSort(stored: string | null): LibrarySort {
  return LIBRARY_SORT.find((sort) => sort === stored) ?? "az";
}
