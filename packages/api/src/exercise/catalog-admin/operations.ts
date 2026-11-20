import { randomBytes } from "node:crypto";

import { ORPCError } from "@orpc/server";
import type { Database, DbExecutor, Transaction } from "@workspace/db";
import { uuidv7 } from "@workspace/db/columns";
import type {
  CatalogExerciseFields,
  ExerciseMediaSlot,
  EXERCISE_MEDIA_LIMITS,
} from "@workspace/shared";
import { and, asc, eq, ilike, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";

import { catalogRowSchema, type CatalogRow } from "../catalog-file";
import { exerciseTypeLocked } from "../operations/exercise-type-locked";
import { exercise } from "../tables";

/** Every key the admin uploads lives under this prefix of the public bucket. */
export const ADMIN_MEDIA_PREFIX = "exercises/admin/";

const EXTENSIONS: Record<
  (typeof EXERCISE_MEDIA_LIMITS)[ExerciseMediaSlot]["types"][number],
  string
> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

/**
 * A server-chosen key, unique per upload (exercise id, or `new`, plus a random suffix), so a
 * replaced file never serves stale from a cache.
 */
export function mediaKeyFor(
  slot: ExerciseMediaSlot,
  contentType: keyof typeof EXTENSIONS,
  exerciseId: string | undefined,
) {
  const suffix = randomBytes(6).toString("hex");
  return `${ADMIN_MEDIA_PREFIX}${exerciseId ?? "new"}-${slot}-${suffix}.${EXTENSIONS[contentType]}`;
}

const catalogOnly = isNull(exercise.userId);

const titleTaken = () =>
  new ORPCError("CONFLICT", {
    message: "Another catalog exercise has this title",
    data: { code: "CATALOG_TITLE_TAKEN" },
  });

/** True when Postgres refused a duplicate title (either catalog title index). */
function isTitleViolation(error: Error): boolean {
  const cause = error.cause instanceof Error ? error.cause : error;
  return "code" in cause && cause.code === "23505";
}

async function assertTitleFree(tx: DbExecutor, title: string, exceptId?: string) {
  const clash = await tx
    .select({ id: exercise.id })
    .from(exercise)
    .where(
      and(
        catalogOnly,
        isNull(exercise.retiredAt),
        sql`lower(${exercise.title}) = lower(${title})`,
        ...(exceptId ? [ne(exercise.id, exceptId)] : []),
      ),
    )
    .limit(1);
  if (clash.length > 0) throw titleTaken();
}

/** Runs a write and turns a unique-title violation into the CONFLICT the admin understands. */
async function mapTitleViolation<Result>(work: () => Promise<Result>): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Error && isTitleViolation(error)) throw titleTaken();
    throw error;
  }
}

export type CatalogListInput = {
  search?: string | undefined;
  primaryMuscle?: string | undefined;
  equipment?: string | undefined;
  exerciseType?: string | undefined;
  retired: "live" | "retired" | "all";
  page: number;
  limit: number;
};

const listColumns = {
  id: exercise.id,
  title: exercise.title,
  primaryMuscle: exercise.primaryMuscle,
  equipment: exercise.equipment,
  exerciseType: exercise.exerciseType,
  rank: exercise.rank,
  thumbnailKey: exercise.thumbnailKey,
  retiredAt: exercise.retiredAt,
  updatedAt: exercise.updatedAt,
};

/** One page of catalog rows by title; never a Custom exercise. */
export async function listCatalog(db: Database, input: CatalogListInput) {
  const filters: SQL[] = [catalogOnly];
  const search = input.search?.trim();
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const match = or(
      ilike(exercise.title, pattern),
      ilike(exercise.aka, pattern),
      ilike(exercise.searchTerms, pattern),
    );
    if (match) filters.push(match);
  }
  if (input.primaryMuscle) filters.push(eq(exercise.primaryMuscle, input.primaryMuscle));
  if (input.equipment) filters.push(eq(exercise.equipment, input.equipment));
  if (input.exerciseType) filters.push(eq(exercise.exerciseType, input.exerciseType));
  if (input.retired === "live") filters.push(isNull(exercise.retiredAt));
  if (input.retired === "retired") filters.push(isNotNull(exercise.retiredAt));
  const where = and(...filters);
  const [rows, [total]] = await Promise.all([
    db
      .select(listColumns)
      .from(exercise)
      .where(where)
      .orderBy(asc(exercise.title), asc(exercise.id))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(exercise)
      .where(where),
  ]);
  return { rows, total: total?.count ?? 0 };
}

/** One catalog row, or null (a Custom exercise id is null too). */
export async function getCatalogRow(db: DbExecutor, id: string) {
  const [row] = await db
    .select()
    .from(exercise)
    .where(and(eq(exercise.id, id), catalogOnly))
    .limit(1);
  return row ?? null;
}

export type CatalogMediaKeys = { thumbnailKey: string | null; videoKey: string | null };

/** Inserts a catalog exercise with a server-generated UUIDv7 id. */
export async function createCatalogExercise(
  tx: Transaction,
  fields: CatalogExerciseFields,
  media: CatalogMediaKeys,
  retired: boolean,
) {
  await assertTitleFree(tx, fields.title);
  const now = new Date();
  const id = uuidv7();
  await mapTitleViolation(() =>
    tx.insert(exercise).values({
      id,
      userId: null,
      ...fields,
      ...media,
      retiredAt: retired ? now : null,
      createdAt: now,
      updatedAt: now,
    }),
  );
  return { id };
}

export type CatalogPatch = Partial<CatalogExerciseFields> & Partial<CatalogMediaKeys>;

const PATCH_FIELDS = [
  "title",
  "primaryMuscle",
  "secondaryMuscles",
  "primaryDetail",
  "secondaryDetail",
  "equipment",
  "exerciseType",
  "isFullBodyweight",
  "aka",
  "searchTerms",
  "instructions",
  "rank",
  "thumbnailKey",
  "videoKey",
] as const satisfies readonly (keyof CatalogPatch)[];
type PatchField = (typeof PATCH_FIELDS)[number];

/**
 * Changes the given fields of a catalog row. The type is locked once a set references the
 * exercise, checked in this transaction. Bumps `updated_at`, so the `exercise_catalog` stream
 * delivers it. Returns the names of the fields that changed.
 */
export async function updateCatalogExercise(tx: Transaction, id: string, patch: CatalogPatch) {
  const current = await getCatalogRow(tx, id);
  if (!current) throw new ORPCError("NOT_FOUND", { message: "No such catalog exercise" });
  if (patch.exerciseType !== undefined && patch.exerciseType !== current.exerciseType) {
    if (await exerciseTypeLocked(tx, id)) {
      throw new ORPCError("CONFLICT", {
        message: "Sets already use this exercise; its type cannot change",
        data: { code: "EXERCISE_TYPE_LOCKED" },
      });
    }
  }
  if (patch.title !== undefined && current.retiredAt === null) {
    await assertTitleFree(tx, patch.title, id);
  }
  const before: Record<PatchField, string | number | boolean | string[] | null> = {
    title: current.title,
    primaryMuscle: current.primaryMuscle,
    secondaryMuscles: current.secondaryMuscles,
    primaryDetail: current.primaryDetail,
    secondaryDetail: current.secondaryDetail,
    equipment: current.equipment,
    exerciseType: current.exerciseType,
    isFullBodyweight: current.isFullBodyweight,
    aka: current.aka,
    searchTerms: current.searchTerms,
    instructions: current.instructions,
    rank: current.rank,
    thumbnailKey: current.thumbnailKey,
    videoKey: current.videoKey,
  };
  const changed = PATCH_FIELDS.values()
    .filter(
      (name) =>
        patch[name] !== undefined && JSON.stringify(patch[name]) !== JSON.stringify(before[name]),
    )
    .toArray();
  if (changed.length === 0) return { changed };
  await mapTitleViolation(() =>
    tx
      .update(exercise)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(exercise.id, id), catalogOnly)),
  );
  return { changed };
}

/** Retires (`retired: true`) or restores a catalog row. Restoring needs a free title. */
export async function setCatalogRetired(tx: Transaction, id: string, retired: boolean) {
  const current = await getCatalogRow(tx, id);
  if (!current) throw new ORPCError("NOT_FOUND", { message: "No such catalog exercise" });
  if (!retired) await assertTitleFree(tx, current.title, id);
  await mapTitleViolation(() =>
    tx
      .update(exercise)
      .set({
        retiredAt: retired ? (current.retiredAt ?? new Date()) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(exercise.id, id), catalogOnly)),
  );
  return current;
}

/** The whole catalog in the committed seed file's shape, sorted by id. */
export async function exportCatalog(db: Database): Promise<CatalogRow[]> {
  const rows = await db.select().from(exercise).where(catalogOnly).orderBy(asc(exercise.id));
  return rows.map((row) =>
    catalogRowSchema.parse({
      id: row.id,
      title: row.title,
      primary_muscle: row.primaryMuscle,
      secondary_muscles: row.secondaryMuscles,
      primary_detail: row.primaryDetail,
      secondary_detail: row.secondaryDetail,
      equipment: row.equipment,
      exercise_type: row.exerciseType,
      is_full_bodyweight: row.isFullBodyweight,
      rank: row.rank,
      search_terms: row.searchTerms,
      aka: row.aka,
      instructions: row.instructions,
      video_key: row.videoKey,
      thumbnail_key: row.thumbnailKey,
      retired: row.retiredAt !== null,
    }),
  );
}
