import { MUSCLE_GROUPS, type MuscleDetail, type MuscleGroup } from "@workspace/shared";
import { z } from "zod";

import { parseMuscleDetails } from "./details";
import type { ExerciseDatabase } from "./store";

const muscleGroupSchema = z.enum(MUSCLE_GROUPS);

/** PowerSync hands a Postgres array over as JSON text. */
const rowSchema = z.object({
  id: z.string(),
  title: z.string(),
  primary_muscle: muscleGroupSchema,
  secondary_muscles: z.string().nullable(),
  primary_detail: z.string().nullable(),
  secondary_detail: z.string().nullable(),
});
const secondarySchema = z.array(muscleGroupSchema);

/** The muscles one exercise works, retired or not. */
export type ExerciseMuscles = {
  id: string;
  title: string;
  primary_muscle: MuscleGroup;
  secondary_muscles: MuscleGroup[];
  primary_detail: MuscleDetail[];
  secondary_detail: MuscleDetail[];
};

function parseSecondary(text: string | null): MuscleGroup[] | null {
  if (text === null) return [];
  try {
    const parsed = secondarySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Watches the muscles of the exercises `ids` (at most 200). An id the device does not hold yet is
 * left out of the list.
 */
export function watchExerciseMuscles(
  database: ExerciseDatabase,
  ids: readonly string[],
  handlers: { onRows: (rows: ExerciseMuscles[]) => void; onError: (error: Error) => void },
): () => void {
  const unique = [...new Set(ids)].slice(0, 200);
  if (unique.length === 0) {
    handlers.onRows([]);
    return () => undefined;
  }
  const controller = new AbortController();
  database.watchWithCallback(
    `SELECT id, title, primary_muscle, secondary_muscles, primary_detail, secondary_detail FROM exercise WHERE id IN (${unique.map(() => "?").join(",")})`,
    unique,
    {
      onResult: (result) => {
        if (controller.signal.aborted) return;
        const rows: ExerciseMuscles[] = [];
        for (const raw of result.array) {
          const parsed = rowSchema.safeParse(raw);
          const secondary = parsed.success ? parseSecondary(parsed.data.secondary_muscles) : null;
          if (!parsed.success || secondary === null) {
            handlers.onError(new Error("The local exercises could not be read"));
            return;
          }
          rows.push({
            id: parsed.data.id,
            title: parsed.data.title,
            primary_muscle: parsed.data.primary_muscle,
            secondary_muscles: secondary,
            primary_detail: parseMuscleDetails(parsed.data.primary_detail),
            secondary_detail: parseMuscleDetails(parsed.data.secondary_detail),
          });
        }
        handlers.onRows(rows);
      },
      onError: (error) => {
        if (!controller.signal.aborted) handlers.onError(error);
      },
    },
    { signal: controller.signal, tables: ["exercise"], throttleMs: 150 },
  );
  return () => controller.abort();
}
