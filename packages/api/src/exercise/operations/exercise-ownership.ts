import type { DbExecutor } from "@workspace/db";
import { eq } from "drizzle-orm";

import { exercise } from "../tables";
import type { ExerciseRow } from "./custom-exercise";

export type ExerciseOwnership =
  | { kind: "absent" }
  | { kind: "catalog" }
  | { kind: "other-user" }
  | { kind: "own"; row: ExerciseRow };

/** Who an exercise id belongs to, from one writer's point of view. */
export async function exerciseOwnership(
  db: DbExecutor,
  userId: string,
  id: string,
): Promise<ExerciseOwnership> {
  const [row] = await db.select().from(exercise).where(eq(exercise.id, id)).limit(1);
  if (!row) return { kind: "absent" };
  if (row.userId === null) return { kind: "catalog" };
  if (row.userId !== userId) return { kind: "other-user" };
  return { kind: "own", row };
}
