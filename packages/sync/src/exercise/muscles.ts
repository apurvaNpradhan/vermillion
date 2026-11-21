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

/** How many ids one query takes, well under SQLite's variable limit. */
const BATCH = 200;

/**
 * Watches the muscles of the exercises `ids`, however many: they are read in batches and handed
 * over together once every batch has loaded. An id the device does not hold yet is left out of
 * the list.
 */
export function watchExerciseMuscles(
  database: Pick<ExerciseDatabase, "watchWithCallback">,
  ids: readonly string[],
  handlers: { onRows: (rows: ExerciseMuscles[]) => void; onError: (error: Error) => void },
): () => void {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    handlers.onRows([]);
    return () => undefined;
  }
  const controller = new AbortController();
  const batches: string[][] = [];
  for (let index = 0; index < unique.length; index += BATCH) {
    batches.push(unique.slice(index, index + BATCH));
  }
  const loaded: (ExerciseMuscles[] | undefined)[] = batches.map(() => undefined);
  batches.forEach((batch, position) => {
    const fail = (error: Error) => {
      if (controller.signal.aborted) return;
      loaded[position] = undefined;
      handlers.onError(error);
    };
    database.watchWithCallback(
      `SELECT id, title, primary_muscle, secondary_muscles, primary_detail, secondary_detail FROM exercise WHERE id IN (${batch.map(() => "?").join(",")})`,
      batch,
      {
        onResult: (result) => {
          if (controller.signal.aborted) return;
          const rows: ExerciseMuscles[] = [];
          for (const raw of result.array) {
            const parsed = rowSchema.safeParse(raw);
            const secondary = parsed.success ? parseSecondary(parsed.data.secondary_muscles) : null;
            if (!parsed.success || secondary === null) {
              fail(new Error("The local exercises could not be read"));
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
          loaded[position] = rows;
          if (loaded.every((part) => part !== undefined)) handlers.onRows(loaded.flat());
        },
        onError: fail,
      },
      { signal: controller.signal, tables: ["exercise"], throttleMs: 150 },
    );
  });
  return () => controller.abort();
}
