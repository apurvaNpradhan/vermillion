import { useCallback } from "react";
import { z } from "zod";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

const recencySchema = z.array(
  z.object({ id: z.string(), title: z.string(), lastDone: z.string() }),
);

/** One watch for the latest training date of each surviving Workout, including older history. */
export function useWorkoutRecency() {
  return useLocalWatch(
    useCallback((db, onValue: (rows: z.infer<typeof recencySchema>) => void, onError) => {
      const controller = new AbortController();
      db.watchWithCallback(
        `SELECT w.id, s.title, MAX(s.started_at) AS lastDone
       FROM training_session s JOIN workout w ON w.id = s.workout_id
       WHERE s.finished_at IS NOT NULL
       GROUP BY w.id ORDER BY lastDone DESC`,
        [],
        {
          onResult: (result) => {
            const parsed = recencySchema.safeParse(result.array);
            if (parsed.success) onValue(parsed.data);
            else onError();
          },
          onError,
        },
        { signal: controller.signal, tables: ["training_session", "workout"] },
      );
      return () => controller.abort();
    }, []),
  );
}
