import type { DbExecutor } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";

/**
 * Whether a Logged set references the exercise, which fixes its type for good: changing it would
 * reinterpret logged values. Reads the training tables by name (no import across verticals).
 */
export async function exerciseTypeLocked(db: DbExecutor, exerciseId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM session_set s
        JOIN session_exercise e ON e.id = s.session_exercise_id
       WHERE e.exercise_id = ${exerciseId}
    ) AS locked`);
  const [row] = z.object({ rows: z.array(z.object({ locked: z.boolean() })) }).parse(result).rows;
  return row?.locked ?? false;
}
