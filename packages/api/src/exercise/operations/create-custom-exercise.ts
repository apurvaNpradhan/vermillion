import type { DbExecutor } from "@workspace/db";
import type { CustomExerciseInput } from "@workspace/shared";

import { exercise } from "../tables";

/**
 * Inserts a Custom exercise owned by `userId`. Server-owned columns (rank, aka, media keys,
 * search terms) stay at their defaults whatever the client sent. A duplicate id fails with a
 * unique violation.
 */
export async function createCustomExercise(
  db: DbExecutor,
  userId: string,
  id: string,
  input: CustomExerciseInput,
  retired: boolean,
): Promise<void> {
  await db.insert(exercise).values({
    id,
    userId,
    title: input.title,
    primaryMuscle: input.primary_muscle,
    secondaryMuscles: input.secondary_muscles,
    equipment: input.equipment,
    exerciseType: input.exercise_type,
    isFullBodyweight: input.is_full_bodyweight,
    instructions: input.instructions,
    retiredAt: retired ? new Date() : null,
  });
}
