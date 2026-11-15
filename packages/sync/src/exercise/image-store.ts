import { and, eq, isNotNull } from "drizzle-orm";
import {
  insertMedia,
  removeMedia,
  writeMedia,
  type MediaDatabase,
  type NewMedia,
} from "../media/index";
import { exercise } from "./tables";

export function setExerciseImage(
  database: MediaDatabase,
  id: string,
  image: Omit<NewMedia, "kind"> | null,
  scope?: string,
) {
  return writeMedia(database, scope, async (tx) => {
    const [row] = await tx
      .select()
      .from(exercise)
      .where(and(eq(exercise.id, id), isNotNull(exercise.user_id)))
      .limit(1);
    if (!row) throw new Error("Custom exercise not found");
    const mediaId = image ? await insertMedia(tx, { ...image, kind: "exercise_image" }) : null;
    await tx.update(exercise).set({ image_media_id: mediaId }).where(eq(exercise.id, id));
    if (row.image_media_id) await removeMedia(tx, row.image_media_id);
    return row.image_media_id;
  });
}
