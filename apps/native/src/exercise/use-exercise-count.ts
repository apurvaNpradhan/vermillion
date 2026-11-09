import { DEFAULT_LIBRARY_FILTERS, watchExerciseLibraryCount } from "@workspace/sync";
import { useEffect, useState } from "react";

import { useLocalData } from "@/sync";

/**
 * How many exercises the device holds (the catalog and the user's live Custom exercises), live
 * from the local database; `null` until the first answer.
 */
export function useExerciseCount(): number | null {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!database) return;
    return watchExerciseLibraryCount(database, DEFAULT_LIBRARY_FILTERS, {
      onCount: setTotal,
      onError: () => undefined,
    });
  }, [database]);

  return total;
}
