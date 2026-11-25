import { TRAINING_LIMITS } from "@workspace/shared";
import { useCallback } from "react";
import { z } from "zod";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

const recencySchema = z.array(
  z.object({ id: z.string(), title: z.string(), lastDone: z.string() }),
);

/** One watch for the latest training date of each surviving Workout, including older history. */
export function useWorkoutRecency(standaloneOnly = false) {
  return useLocalWatch(
    useCallback(
      (db, onValue: (rows: z.infer<typeof recencySchema>) => void, onError) => {
        const controller = new AbortController();
        db.watchWithCallback(
          `SELECT w.id, s.title, s.started_at AS lastDone
         FROM workout w JOIN training_session s ON s.id = (
           SELECT id FROM training_session
           WHERE workout_id = w.id AND finished_at IS NOT NULL
           ORDER BY started_at DESC, id DESC LIMIT 1
         )
         ${standaloneOnly ? "WHERE w.program_id IS NULL" : ""}
         ORDER BY lastDone DESC, w.id DESC LIMIT ${TRAINING_LIMITS.liveWorkouts}`,
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
      },
      [standaloneOnly],
    ),
  );
}
