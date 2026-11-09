import type { DbExecutor } from "@workspace/db";
import { and, count, eq, isNull, ne } from "drizzle-orm";

import { exercise } from "../tables";

/** Live (not archived) Custom exercises of the user, not counting the exercise `except`. */
export async function countLiveCustom(
  db: DbExecutor,
  userId: string,
  except: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(exercise)
    .where(and(eq(exercise.userId, userId), isNull(exercise.retiredAt), ne(exercise.id, except)));
  return row?.total ?? 0;
}
