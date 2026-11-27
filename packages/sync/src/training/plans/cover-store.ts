import { eq } from "drizzle-orm";

import { insertMedia, type NewMedia } from "../../media/index";
import { program, workout } from "../tables";
import { type TrainingDatabase, write } from "../store-common";

// Cover references can be shared by offline copies. Only the server retires the media.

export function setProgramCover(
  database: TrainingDatabase,
  programId: string,
  mediaId: string | null,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [row] = await tx
      .update(program)
      .set({ cover_media_id: mediaId })
      .where(eq(program.id, programId))
      .returning({ id: program.id });
    return row !== undefined;
  });
}

/** Uploads the media row before the reference, in one transaction. */
export function setProgramCoverToNewMedia(
  database: TrainingDatabase,
  programId: string,
  media: Omit<NewMedia, "kind">,
  expectedInstallId?: string,
): Promise<{ mediaId: string }> {
  return write(database, expectedInstallId, async (tx) => {
    const mediaId = await insertMedia(tx, { ...media, kind: "program_cover" });
    const [row] = await tx
      .update(program)
      .set({ cover_media_id: mediaId })
      .where(eq(program.id, programId))
      .returning({ id: program.id });
    if (!row) throw new Error("The Program is gone");
    return { mediaId };
  });
}

export function setWorkoutCover(
  database: TrainingDatabase,
  workoutId: string,
  mediaId: string | null,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [row] = await tx
      .update(workout)
      .set({ cover_media_id: mediaId })
      .where(eq(workout.id, workoutId))
      .returning({ id: workout.id });
    return row !== undefined;
  });
}

/** Uploads the media row before the reference, in one transaction. */
export function setWorkoutCoverToNewMedia(
  database: TrainingDatabase,
  workoutId: string,
  media: Omit<NewMedia, "kind">,
  expectedInstallId?: string,
): Promise<{ mediaId: string }> {
  return write(database, expectedInstallId, async (tx) => {
    const mediaId = await insertMedia(tx, { ...media, kind: "workout_cover" });
    const [row] = await tx
      .update(workout)
      .set({ cover_media_id: mediaId })
      .where(eq(workout.id, workoutId))
      .returning({ id: workout.id });
    if (!row) throw new Error("The Workout is gone");
    return { mediaId };
  });
}
