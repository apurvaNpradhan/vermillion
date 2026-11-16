import { createContext, useCallback, useContext } from "react";
import { z } from "zod";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

const rows = z.array(
  z.object({ id: z.string(), state: z.number().nullable(), uri: z.string().nullable() }),
);
export type BatchFile = { present: boolean; state: number | null; uri: string | null };
export const MediaImageBatch = createContext<ReadonlyMap<string, BatchFile> | null>(null);
export const useImageBatch = () => useContext(MediaImageBatch);

/** One thumbnail file watch for the visible gallery rows. */
export function useMediaImageBatch(ids: readonly string[]) {
  const key = JSON.stringify(ids);
  const subscribe = useCallback(
    (
      database: Parameters<Parameters<typeof useLocalWatch>[0]>[0],
      onValue: (files: ReadonlyMap<string, BatchFile>) => void,
      onError: () => void,
    ) => {
      const controller = new AbortController();
      database.watchWithCallback(
        `SELECT m.id, a.state, a.local_uri AS uri FROM media m
      LEFT JOIN attachments a ON a.id = m.id || '_t'
      WHERE m.id IN (SELECT value FROM json_each(?))`,
        [key],
        {
          onResult: (result) =>
            onValue(
              new Map(
                rows
                  .parse(result.array)
                  .map((row) => [row.id, { present: true, state: row.state, uri: row.uri }]),
              ),
            ),
          onError,
        },
        { signal: controller.signal, tables: ["media", "attachments"] },
      );
      return () => controller.abort();
    },
    [key],
  );
  return useLocalWatch(subscribe).value ?? new Map<string, BatchFile>();
}
