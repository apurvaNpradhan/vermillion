import { useCallback } from "react";
import { z } from "zod";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

const sizeRows = z.array(z.object({ id: z.string(), width: z.number(), height: z.number() }));

const SIZES_SQL = `SELECT id, width, height FROM media
  WHERE id IN (SELECT value FROM json_each(?)) LIMIT 200`;

export type MediaSize = { width: number; height: number };

const EMPTY: ReadonlyMap<string, MediaSize> = new Map();

/** The pixel sizes of some media rows, by id; an id this device has no row for is absent. */
export function useMediaSizes(mediaIds: readonly string[]): ReadonlyMap<string, MediaSize> {
  const key = JSON.stringify(mediaIds);
  const subscribe = useCallback(
    (
      database: Parameters<Parameters<typeof useLocalWatch>[0]>[0],
      onValue: (sizes: Map<string, MediaSize>) => void,
      onError: () => void,
    ) => {
      const controller = new AbortController();
      database.watchWithCallback(
        SIZES_SQL,
        [key],
        {
          onResult: (result) =>
            onValue(
              new Map(
                sizeRows
                  .parse(result.array)
                  .map((row) => [row.id, { width: row.width, height: row.height }]),
              ),
            ),
          onError,
        },
        { signal: controller.signal, tables: ["media"] },
      );
      return () => controller.abort();
    },
    [key],
  );
  return useLocalWatch(subscribe).value ?? EMPTY;
}
