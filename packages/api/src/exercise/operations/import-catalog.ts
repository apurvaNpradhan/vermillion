import { createHash } from "node:crypto";

import type { Database } from "@workspace/db";
import { log } from "@workspace/logger";
import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";

import { parseCatalog, type CatalogRow } from "../catalog-file";
import { exercise, referenceImport } from "../tables";

const CATALOG = "exercise";
/** Serialises two servers importing at once (a rolling deploy overlaps them). */
const IMPORT_LOCK_KEYS = [0x65786572, 1] as const;
const BATCH = 200;

export class CatalogImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogImportError";
  }
}

export type CatalogImportResult = {
  /** The file's fingerprint matched the last import, so nothing was read or written. */
  skipped: boolean;
  inserted: number;
  updated: number;
  retired: number;
  restored: number;
  unchanged: number;
};

const none = { inserted: 0, updated: 0, retired: 0, restored: 0, unchanged: 0 };

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let offset = 0; offset < items.length; offset += BATCH) {
    out.push(items.slice(offset, offset + BATCH));
  }
  return out;
}

/**
 * Imports the catalog file (Reference data) into `exercise`, in one transaction: validates the
 * whole file first, skips when its SHA-256 equals the last import's (unless `force`), upserts
 * only rows that changed, retires catalog rows missing from the file and restores ones that
 * return. Refuses when a file id belongs to a Custom exercise. Call it after migrations, once
 * the table is in the `powersync` publication.
 */
export async function importCatalog(
  db: Database,
  text: string,
  force = false,
): Promise<CatalogImportResult> {
  const rows = parseCatalog(text);
  const fingerprint = createHash("sha256").update(text).digest("hex");

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${IMPORT_LOCK_KEYS[0]}, ${IMPORT_LOCK_KEYS[1]})`,
    );

    const [last] = await tx
      .select({ fingerprint: referenceImport.fingerprint })
      .from(referenceImport)
      .where(eq(referenceImport.catalog, CATALOG))
      .limit(1);
    if (!force && last?.fingerprint === fingerprint) {
      return { skipped: true, ...none };
    }

    const ids = rows.map((row) => row.id);
    for (const batch of chunks(ids)) {
      const clash = await tx
        .select({ id: exercise.id })
        .from(exercise)
        .where(and(inArray(exercise.id, batch), isNotNull(exercise.userId)))
        .limit(1);
      if (clash.length > 0) {
        throw new CatalogImportError("a catalog id belongs to a Custom exercise");
      }
    }

    const before = new Map(
      (
        await tx
          .select({ id: exercise.id, retiredAt: exercise.retiredAt })
          .from(exercise)
          .where(isNull(exercise.userId))
      ).map((row) => [row.id, row.retiredAt !== null]),
    );

    const now = new Date();
    // The unique catalog title index is checked per row, so rows that swap (or hand on) titles
    // would collide mid-upsert. Park the titles that will change on the row's own id first; the
    // upsert then writes the real title (and bumps updated_at, since the title did change).
    // Rows whose title stays the same are not touched.
    for (const batch of chunks(rows)) {
      const wanted = JSON.stringify(batch.map((row) => ({ id: row.id, title: row.title })));
      await tx.execute(sql`
        UPDATE exercise AS e SET title = e.id::text
          FROM jsonb_to_recordset(${wanted}::jsonb) AS v(id text, title text)
         WHERE e.id::text = v.id AND e.user_id IS NULL AND e.title <> v.title`);
    }

    let inserted = 0;
    let updated = 0;
    let restored = 0;
    let retired = 0;
    for (const batch of chunks(rows)) {
      const changed = await tx
        .insert(exercise)
        .values(batch.map((row) => toValues(row, now)))
        .onConflictDoUpdate({
          target: exercise.id,
          set: {
            title: sql`excluded.title`,
            primaryMuscle: sql`excluded.primary_muscle`,
            secondaryMuscles: sql`excluded.secondary_muscles`,
            equipment: sql`excluded.equipment`,
            exerciseType: sql`excluded.exercise_type`,
            isFullBodyweight: sql`excluded.is_full_bodyweight`,
            rank: sql`excluded.rank`,
            searchTerms: sql`excluded.search_terms`,
            aka: sql`excluded.aka`,
            instructions: sql`excluded.instructions`,
            videoKey: sql`excluded.video_key`,
            thumbnailKey: sql`excluded.thumbnail_key`,
            retiredAt: sql`CASE WHEN excluded.retired_at IS NULL THEN NULL ELSE coalesce(${exercise.retiredAt}, excluded.retired_at) END`,
            updatedAt: now,
          },
          // Writes (and so bumps updated_at) only when something differs. Retirement compares
          // as a flag: its timestamp differs on every import.
          setWhere: sql`${exercise.userId} IS NULL AND (
            ${exercise.title}, ${exercise.primaryMuscle}, ${exercise.secondaryMuscles},
            ${exercise.equipment}, ${exercise.exerciseType}, ${exercise.isFullBodyweight},
            ${exercise.rank}, ${exercise.searchTerms}, ${exercise.aka}, ${exercise.instructions},
            ${exercise.videoKey}, ${exercise.thumbnailKey}, (${exercise.retiredAt} IS NOT NULL)
          ) IS DISTINCT FROM (
            excluded.title, excluded.primary_muscle, excluded.secondary_muscles,
            excluded.equipment, excluded.exercise_type, excluded.is_full_bodyweight,
            excluded.rank, excluded.search_terms, excluded.aka, excluded.instructions,
            excluded.video_key, excluded.thumbnail_key, (excluded.retired_at IS NOT NULL)
          )`,
        })
        .returning({ id: exercise.id, retiredAt: exercise.retiredAt });
      for (const row of changed) {
        const wasRetired = before.get(row.id);
        if (wasRetired === undefined) inserted += 1;
        else if (wasRetired && row.retiredAt === null) restored += 1;
        else if (!wasRetired && row.retiredAt !== null) retired += 1;
        else updated += 1;
      }
    }

    const gone = await tx
      .update(exercise)
      .set({ retiredAt: now, updatedAt: now })
      .where(and(isNull(exercise.userId), isNull(exercise.retiredAt), notInArray(exercise.id, ids)))
      .returning({ id: exercise.id });
    retired += gone.length;

    await tx
      .insert(referenceImport)
      .values({ catalog: CATALOG, fingerprint, importedAt: now })
      .onConflictDoUpdate({
        target: referenceImport.catalog,
        set: { fingerprint, importedAt: now },
      });

    return {
      skipped: false,
      inserted,
      updated,
      retired,
      restored,
      unchanged: rows.length - inserted - updated - restored - (retired - gone.length),
    };
  });

  log.info({ action: "exercise.catalog.import", ...result });
  return result;
}

function toValues(row: CatalogRow, now: Date) {
  return {
    id: row.id,
    userId: null,
    title: row.title,
    primaryMuscle: row.primary_muscle,
    secondaryMuscles: row.secondary_muscles,
    equipment: row.equipment,
    exerciseType: row.exercise_type,
    isFullBodyweight: row.is_full_bodyweight,
    rank: row.rank,
    searchTerms: row.search_terms,
    aka: row.aka,
    instructions: row.instructions,
    videoKey: row.video_key,
    thumbnailKey: row.thumbnail_key,
    retiredAt: row.retired ? now : null,
  };
}
