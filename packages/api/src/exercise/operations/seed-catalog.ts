import { createDb, type Database } from "@workspace/db";
import { log } from "@workspace/logger";
import { isNull, sql } from "drizzle-orm";

import { parseCatalog, type CatalogRow } from "../catalog-file";
import { exercise } from "../tables";
import { bundledCatalogText } from "./bundled-catalog";

/** Serialises two servers seeding at once (a rolling deploy overlaps them). */
const SEED_LOCK_KEYS = [0x65786572, 1] as const;
const BATCH = 200;

/**
 * Seeds the catalog (Reference data) from the committed file, only when the table holds no
 * catalog rows. Once there are any, the database is the source of truth (the admin edits it), so
 * this does nothing: a restart never overwrites, retires or restores an exercise. Validates the
 * whole file first; refuses an id that belongs to a Custom exercise.
 */
export async function seedCatalog(db: Database, text: string): Promise<{ seeded: number }> {
  const rows = parseCatalog(text);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SEED_LOCK_KEYS[0]}, ${SEED_LOCK_KEYS[1]})`);
    const [existing] = await tx
      .select({ id: exercise.id })
      .from(exercise)
      .where(isNull(exercise.userId))
      .limit(1);
    if (existing) return { seeded: 0 };
    const now = new Date();
    for (let offset = 0; offset < rows.length; offset += BATCH) {
      await tx
        .insert(exercise)
        .values(rows.slice(offset, offset + BATCH).map((row) => toValues(row, now)));
    }
    return { seeded: rows.length };
  });
  log.info({ action: "exercise.catalog.seed", ...result });
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

/** Seeds from the committed catalog file; the server runs this after its migrations. */
export function seedBundledCatalog(db: Database) {
  return seedCatalog(db, bundledCatalogText());
}

/** `pnpm --filter server catalog:seed`: the same seed against a database URL, on its own pool. */
export async function runCatalogSeed(databaseUrl: string) {
  const { db, pool } = createDb(databaseUrl, { max: 2 });
  try {
    return await seedBundledCatalog(db);
  } finally {
    await pool.end();
  }
}
