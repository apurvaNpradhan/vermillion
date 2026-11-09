import type { DbExecutor } from "@workspace/db";

/**
 * Whether a logged set references the exercise, which fixes its type for good. There is no set
 * table yet; the training slice replaces this body with the lookup.
 */
export async function exerciseTypeLocked(_db: DbExecutor, _exerciseId: string): Promise<boolean> {
  return false;
}
