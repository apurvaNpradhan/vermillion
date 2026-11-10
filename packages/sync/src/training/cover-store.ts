import { eq, inArray } from "drizzle-orm";

import { program, programCover } from "./tables";

import { type TrainingDatabase, write, nowIso } from "./store-common";
// ---- Program covers (local only) ----

/** The cover photo of a Program on this device: where the file is. */
export type ProgramCoverRow = typeof programCover.$inferSelect;

/**
 * Records `uri` as the Program's cover photo, replacing an earlier one. The table is local only,
 * so this never uploads. Returns the uri it replaced (the same one when the file was overwritten).
 */
export function setProgramCover(
  database: TrainingDatabase,
  programId: string,
  uri: string,
  expectedInstallId?: string,
): Promise<string | null> {
  return write(database, expectedInstallId, async (tx) => {
    const [existing] = await tx
      .select({ uri: programCover.uri })
      .from(programCover)
      .where(eq(programCover.id, programId))
      .limit(1);
    const row = { program_id: programId, uri, updated_at: nowIso() };
    if (existing) await tx.update(programCover).set(row).where(eq(programCover.id, programId));
    else await tx.insert(programCover).values({ id: programId, ...row });
    return existing?.uri ?? null;
  });
}

/** Forgets the Program's cover photo and returns its uri (the caller deletes the file), or null. */
export function clearProgramCover(
  database: TrainingDatabase,
  programId: string,
  expectedInstallId?: string,
): Promise<string | null> {
  return write(database, expectedInstallId, async (tx) => {
    const removed = await tx
      .delete(programCover)
      .where(eq(programCover.id, programId))
      .returning({ uri: programCover.uri });
    return removed[0]?.uri ?? null;
  });
}

/**
 * Called once a deleted Program's Undo window has passed: forgets its cover when the Program is
 * still gone and returns the uri to delete, or null (it came back, or it had no cover).
 */
export function releaseProgramCover(
  database: TrainingDatabase,
  programId: string,
  expectedInstallId?: string,
): Promise<string | null> {
  return write(database, expectedInstallId, async (tx) => {
    const [live] = await tx
      .select({ id: program.id })
      .from(program)
      .where(eq(program.id, programId))
      .limit(1);
    if (live) return null;
    const removed = await tx
      .delete(programCover)
      .where(eq(programCover.id, programId))
      .returning({ uri: programCover.uri });
    return removed[0]?.uri ?? null;
  });
}

/**
 * Forgets the covers of Programs that no longer exist (deleted here or on another device, after
 * their Undo window) and returns the Program ids that are left. The caller deletes every cover
 * file that is not among them, which also removes the files of a wiped account.
 */
export function sweepProgramCovers(
  database: TrainingDatabase,
  expectedInstallId?: string,
): Promise<string[]> {
  return write(database, expectedInstallId, async (tx) => {
    const covers = await tx.select({ id: programCover.id }).from(programCover);
    const live = new Set((await tx.select({ id: program.id }).from(program)).map((row) => row.id));
    const gone = covers.map((cover) => cover.id).filter((id) => !live.has(id));
    if (gone.length > 0) await tx.delete(programCover).where(inArray(programCover.id, gone));
    return covers.map((cover) => cover.id).filter((id) => live.has(id));
  });
}
