import type { DbExecutor } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

import { exercise } from "../tables";
import { patchValues, type ExercisePatch } from "./custom-exercise";

/** `archive` sets `retired_at` to now (kept if already set), `restore` clears it. */
export type RetireChange = "archive" | "restore" | undefined;

/**
 * Changes only the given fields of one of the user's Custom exercises (dirty fields, ADR 0019),
 * plus archive or restore. False when the exercise is not theirs. Never touches server-owned
 * columns or the owner.
 */
export async function updateCustomExercise(
  db: DbExecutor,
  userId: string,
  id: string,
  patch: ExercisePatch,
  retire: RetireChange,
): Promise<boolean> {
  const now = new Date();
  const retiredAt =
    retire === "restore"
      ? { retiredAt: null }
      : retire === "archive"
        ? { retiredAt: sql`coalesce(${exercise.retiredAt}, ${now.toISOString()}::timestamptz)` }
        : {};
  const changed = await db
    .update(exercise)
    .set({ ...patchValues(patch), ...retiredAt, updatedAt: now })
    .where(and(eq(exercise.id, id), eq(exercise.userId, userId)))
    .returning({ id: exercise.id });
  return changed.length > 0;
}
