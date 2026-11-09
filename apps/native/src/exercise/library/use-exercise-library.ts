import {
  LIBRARY_PAGE_SIZE,
  watchExerciseLibrary,
  watchExerciseLibraryCount,
  type LibraryFilters,
  type LibraryPage,
  type LibraryRow,
} from "@workspace/sync";
import { useCallback, useEffect, useState } from "react";

import { useLocalData, useSyncStatus } from "@/sync";

import { libraryStatus, type LibraryStatus } from "./library-status";

/** The Recent section lists exercises the user trained lately; there is no training yet. */
const NO_RECENT: LibraryRow[] = [];

/**
 * The exercise library for `filters`, read from the local database. Returns a bounded window of
 * rows (`loadMore` widens it), how many exercises match in all, and what the library can say
 * about itself (`status`). Components never query directly.
 */
export function useExerciseLibrary(filters: LibraryFilters) {
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const database = local?.status === "ready" ? local.database : null;
  const { search, muscles, includeSecondary, equipment, show, sort } = filters;
  // The same filters give the same key, so a new object per render does not restart the watch.
  const key = JSON.stringify({ search, muscles, includeSecondary, equipment, show, sort });

  const [widen, setWindow] = useState({ key, limit: LIBRARY_PAGE_SIZE });
  const limit = widen.key === key ? widen.limit : LIBRARY_PAGE_SIZE;
  const [page, setPage] = useState<LibraryPage | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!database) return;
    const parsed: LibraryFilters = JSON.parse(key);
    const stopRows = watchExerciseLibrary(database, parsed, limit, {
      onPage: (next) => {
        setFailed(false);
        setPage(next);
      },
      onError: () => setFailed(true),
    });
    const stopCount = watchExerciseLibraryCount(database, parsed, {
      onCount: setTotal,
      onError: () => setFailed(true),
    });
    return () => {
      stopRows();
      stopCount();
    };
  }, [database, key, limit, attempt]);

  const loadMore = useCallback(
    () => setWindow({ key, limit: limit + LIBRARY_PAGE_SIZE }),
    [key, limit],
  );
  const retry = useCallback(() => {
    setFailed(false);
    setPage(null);
    setAttempt((current) => current + 1);
  }, []);

  const status: LibraryStatus = libraryStatus({
    failed: failed || local?.status === "unavailable",
    snapshot,
    show,
  });

  return {
    rows: page?.rows ?? [],
    recent: NO_RECENT,
    total,
    hasMore: page?.hasMore ?? false,
    /** No result has arrived yet for these filters. */
    isLoading: status !== "error" && (local === null || (database !== null && page === null)),
    status,
    loadMore,
    retry,
  };
}
