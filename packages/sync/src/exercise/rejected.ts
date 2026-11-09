import { z } from "zod";

import type { RejectedWrite } from "../platform/rejected-writes";
import type { ExerciseDatabase } from "./store";

const payloadSchema = z.object({ title: z.string().optional() });

/** The title a rejected exercise write carried, or null (truncated, not JSON, or no title in it). */
export function rejectedExercisePayloadTitle(write: RejectedWrite): string | null {
  if (write.table !== "exercise" || write.truncated) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(write.payload));
    return parsed.success ? (parsed.data.title ?? null) : null;
  } catch {
    return null;
  }
}

const titleRowSchema = z.object({ title: z.string() });

/**
 * The name to show for a rejected exercise write: the title it carried (a create or a rename),
 * else the exercise's title on this device (an archive or a patch of other fields), else null.
 */
export async function rejectedExerciseTitle(
  database: Pick<ExerciseDatabase, "getOptional">,
  write: RejectedWrite,
): Promise<string | null> {
  const carried = rejectedExercisePayloadTitle(write);
  if (carried !== null) return carried;
  const row = await database.getOptional("SELECT title FROM exercise WHERE id = ?", [write.rowId]);
  const parsed = titleRowSchema.safeParse(row);
  return parsed.success ? parsed.data.title : null;
}
