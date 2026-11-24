import { and, eq, ne } from "drizzle-orm";

import { insertMedia, removeMedia, type NewMedia } from "../../media/index";
import { program, workout } from "../tables";
import { type TrainingDatabase, type Tx, write } from "../store-common";

// ---- Program covers (ADR 0040) ----
// A cover is a `media` row of kind `program_cover` that `program.cover_media_id` points at. Changing
// the cover writes the reference and drops the old media in one local transaction, so the upload
// is one transaction too: the server never sees a reference to a media it has not got.

/** Points the Program at `mediaId` and deletes the media it pointed at. Returns the deleted id. */
async function replaceCover(tx: Tx, programId: string, mediaId: string | null) {
  const [current] = await tx
    .select({ cover: program.cover_media_id })
    .from(program)
    .where(eq(program.id, programId))
    .limit(1);
  if (!current) return { found: false as const, replaced: null };
  if (current.cover === mediaId) return { found: true as const, replaced: null };
  await tx.update(program).set({ cover_media_id: mediaId }).where(eq(program.id, programId));
  if (current.cover === null) return { found: true as const, replaced: null };
  const removed = await removeMedia(tx, current.cover);
  return { found: true as const, replaced: removed ? current.cover : null };
}

/**
 * Sets (or clears, with null) the cover of a Program to a media that already exists, and deletes
 * the previous cover media in the same transaction. Returns the id of the deleted media, so the
 * caller can drop its files, or null (nothing was replaced, or the Program is gone).
 */
export function setProgramCover(
  database: TrainingDatabase,
  programId: string,
  mediaId: string | null,
  expectedInstallId?: string,
): Promise<string | null> {
  return write(database, expectedInstallId, async (tx) => {
    return (await replaceCover(tx, programId, mediaId)).replaced;
  });
}

/**
 * Creates a media and makes it the Program's cover, deleting the previous cover media, in one
 * transaction: a cover picked offline shows at once and uploads as one unit. Returns the new
 * media id and the id of the deleted one. Throws if the Program is gone (nothing is written).
 */
export function setProgramCoverToNewMedia(
  database: TrainingDatabase,
  programId: string,
  media: Omit<NewMedia, "kind">,
  expectedInstallId?: string,
): Promise<{ mediaId: string; replaced: string | null }> {
  return write(database, expectedInstallId, async (tx) => {
    const [existing] = await tx
      .select({ id: program.id })
      .from(program)
      .where(eq(program.id, programId))
      .limit(1);
    if (!existing) throw new Error("The Program is gone");
    // The media goes first: its upload must precede the PATCH that references it.
    const mediaId = await insertMedia(tx, { ...media, kind: "program_cover" });
    const { replaced } = await replaceCover(tx, programId, mediaId);
    return { mediaId, replaced };
  });
}

/**
 * Called once a deleted Program's Undo window has passed: deletes its cover media when the Program
 * is still gone. Returns true if it deleted it (the caller drops the files), false if the Program
 * came back or the media was already gone.
 */
export function releaseProgramCover(
  database: TrainingDatabase,
  programId: string,
  mediaId: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [live] = await tx
      .select({ id: program.id })
      .from(program)
      .where(eq(program.id, programId))
      .limit(1);
    if (live) return false;
    return removeMedia(tx, mediaId);
  });
}

// ---- Workout covers ----
// The same shape as a Program cover, kind `workout_cover`. A copy of a Workout (a duplicate, or
// into and out of a Program) points at the same media, so a media is deleted only when nothing
// else references it.

/** True when a Workout other than `exceptWorkoutId`, or a Program, still points at the media. */
async function coverInUse(tx: Tx, mediaId: string, exceptWorkoutId: string | null) {
  const [otherWorkout] = await tx
    .select({ id: workout.id })
    .from(workout)
    .where(
      exceptWorkoutId === null
        ? eq(workout.cover_media_id, mediaId)
        : and(eq(workout.cover_media_id, mediaId), ne(workout.id, exceptWorkoutId)),
    )
    .limit(1);
  if (otherWorkout) return true;
  const [otherProgram] = await tx
    .select({ id: program.id })
    .from(program)
    .where(eq(program.cover_media_id, mediaId))
    .limit(1);
  return otherProgram !== undefined;
}

/** Points the Workout at `mediaId` and deletes the media it pointed at if nothing else uses it. */
async function replaceWorkoutCover(tx: Tx, workoutId: string, mediaId: string | null) {
  const [current] = await tx
    .select({ cover: workout.cover_media_id })
    .from(workout)
    .where(eq(workout.id, workoutId))
    .limit(1);
  if (!current) return { found: false as const, replaced: null };
  if (current.cover === mediaId) return { found: true as const, replaced: null };
  await tx.update(workout).set({ cover_media_id: mediaId }).where(eq(workout.id, workoutId));
  if (current.cover === null || (await coverInUse(tx, current.cover, workoutId))) {
    return { found: true as const, replaced: null };
  }
  const removed = await removeMedia(tx, current.cover);
  return { found: true as const, replaced: removed ? current.cover : null };
}

/**
 * Sets (or clears, with null) the cover of a Workout to a media that already exists, and deletes
 * the previous cover media in the same transaction unless another Workout or Program still uses
 * it. Returns the id of the deleted media, or null.
 */
export function setWorkoutCover(
  database: TrainingDatabase,
  workoutId: string,
  mediaId: string | null,
  expectedInstallId?: string,
): Promise<string | null> {
  return write(database, expectedInstallId, async (tx) => {
    return (await replaceWorkoutCover(tx, workoutId, mediaId)).replaced;
  });
}

/**
 * Creates a media and makes it the Workout's cover in one transaction, deleting the previous
 * cover media when nothing else uses it. Throws if the Workout is gone (nothing is written).
 */
export function setWorkoutCoverToNewMedia(
  database: TrainingDatabase,
  workoutId: string,
  media: Omit<NewMedia, "kind">,
  expectedInstallId?: string,
): Promise<{ mediaId: string; replaced: string | null }> {
  return write(database, expectedInstallId, async (tx) => {
    const [existing] = await tx
      .select({ id: workout.id })
      .from(workout)
      .where(eq(workout.id, workoutId))
      .limit(1);
    if (!existing) throw new Error("The Workout is gone");
    const mediaId = await insertMedia(tx, { ...media, kind: "workout_cover" });
    const { replaced } = await replaceWorkoutCover(tx, workoutId, mediaId);
    return { mediaId, replaced };
  });
}

/**
 * Called once a deleted Workout's Undo window has passed: deletes its cover media when the
 * Workout is still gone and nothing else uses the media. Returns true if it deleted it.
 */
export function releaseWorkoutCover(
  database: TrainingDatabase,
  workoutId: string,
  mediaId: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [live] = await tx
      .select({ id: workout.id })
      .from(workout)
      .where(eq(workout.id, workoutId))
      .limit(1);
    if (live || (await coverInUse(tx, mediaId, null))) return false;
    return removeMedia(tx, mediaId);
  });
}
