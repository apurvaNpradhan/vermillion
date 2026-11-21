import { z } from "zod";

const workoutId = z.uuid();

/** The `workout` parameter of the widget's Start link, or null when it is missing or malformed. */
export function workoutIdFromParam(param: string | string[] | undefined): string | null {
  const parsed = workoutId.safeParse(param);
  return parsed.success ? parsed.data : null;
}
