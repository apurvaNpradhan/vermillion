import {
  LIBRARY_PAGE_SIZE,
  watchExerciseLibrary,
  watchExerciseLibraryCount,
  type LibraryFilters,
  type LibraryPage,
  type LibraryRow,
} from "@workspace/sync";
import { useCallback, useState } from "react";

import { useSyncStatus } from "@/sync";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

import { libraryStatus, type LibraryStatus } from "./library-status";

/** The Recent section lists exercises the user trained lately; there is no training yet. */
const NO_RECENT: LibraryRow[] = [];

/**
 * The exercise library for `filters`, read from the local database. Returns a bounded window of
 * rows (`loadMore` widens it), how many exercises match in all, and what the library can say
 * about itself (`status`). Components never query directly.
 */
export function useExerciseLibrary(filters: LibraryFilters) {
  const { snapshot } = useSyncStatus();
  const { search, muscles, includeSecondary, equipment, show, sort } = filters;
  // The same filters give the same key, so a new object per render does not restart the watch.
  const key = JSON.stringify({ search, muscles, includeSecondary, equipment, show, sort });

  const [widen, setWindow] = useState({ key, limit: LIBRARY_PAGE_SIZE });
  const limit = widen.key === key ? widen.limit : LIBRARY_PAGE_SIZE;
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchExerciseLibrary>[0],
      onValue: (value: { page: LibraryPage; total: number }) => void,
      onError: () => void,
    ) => {
      const parsed: LibraryFilters = JSON.parse(key);
      let page: LibraryPage | undefined;
      let total: number | undefined;
      const emit = () => {
        if (page !== undefined && total !== undefined) onValue({ page, total });
      };
      const stopRows = watchExerciseLibrary(database, parsed, limit, {
        onPage: (value) => {
          page = value;
          emit();
        },
        onError,
      });
      const stopCount = watchExerciseLibraryCount(database, parsed, {
        onCount: (value) => {
          total = value;
          emit();
        },
        onError,
      });
      return () => {
        stopRows();
        stopCount();
      };
    },
    [key, limit],
  );
  const state = useLocalWatch(subscribe);
  const page = state.value?.page;
  const total = state.value?.total ?? null;
  const retry = state.retry;

  const loadMore = useCallback(
    () => setWindow({ key, limit: limit + LIBRARY_PAGE_SIZE }),
    [key, limit],
  );
  const status: LibraryStatus = libraryStatus({
    failed: state.failed,
    snapshot,
    show,
  });

  return {
    rows: page?.rows ?? [],
    recent: NO_RECENT,
    total,
    hasMore: page?.hasMore ?? false,
    /** No result has arrived yet for these filters. */
    isLoading: state.loading,
    status,
    loadMore,
    retry,
  };
}
