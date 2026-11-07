import { z } from "zod";

import { BODY_MAX, TITLE_MAX } from "../limits";
import type { notes } from "../tables";

export const titleSchema = z.string().trim().min(1).max(TITLE_MAX);
export const bodySchema = z.string().max(BODY_MAX);

export const noteSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Note = z.infer<typeof noteSchema>;

/** The wire shape of a stored row (timestamps as ISO strings). */
export function toNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
