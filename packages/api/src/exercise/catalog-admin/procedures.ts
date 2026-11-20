import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import {
  catalogExerciseFields,
  catalogExerciseInput,
  EQUIPMENT,
  EXERCISE_MEDIA_LIMITS,
  EXERCISE_TYPES,
  exerciseMediaSlotSchema,
  MEDIA_UPLOAD_URL_SECONDS,
  MUSCLE_GROUPS,
} from "@workspace/shared";
import { z } from "zod";

import { admin } from "../../admin/index";
import { rateLimit } from "../../platform/orpc/rate-limit";
import type { Services } from "../../platform/services";
import { catalogRowSchema } from "../catalog-file";
import { exerciseTypeLocked } from "../operations/exercise-type-locked";
import {
  ADMIN_MEDIA_PREFIX,
  createCatalogExercise,
  exportCatalog,
  getCatalogRow,
  listCatalog,
  mediaKeyFor,
  setCatalogRetired,
  updateCatalogExercise,
  type CatalogMediaKeys,
} from "./operations";

const catalogApi = admin.meta(openapi({ tags: ["Admin"] }));
const writes = rateLimit({ name: "admin.catalog.write", windowMs: 60_000, max: 120 });
const byId = z.object({ id: z.uuid() });

const mediaKey = z.string().min(1).max(300).startsWith(ADMIN_MEDIA_PREFIX);

const publicUrl = (services: Services, key: string | null) =>
  key ? `${services.config.exerciseMedia.publicUrl.replace(/\/+$/, "")}/${key}` : null;

/** An uploaded key is saved only once the object is really in the bucket. */
async function assertUploaded(services: Services, key: string | null | undefined) {
  if (!key) return;
  if (!(await services.exerciseMediaStore.exists(key))) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The file was not uploaded",
      data: { code: "CATALOG_MEDIA_MISSING" },
    });
  }
}

const thumbnailRequired = () =>
  new ORPCError("BAD_REQUEST", {
    message: "A live catalog exercise needs a thumbnail",
    data: { code: "CATALOG_THUMBNAIL_REQUIRED" },
  });

const listRow = z.object({
  id: z.string(),
  title: z.string(),
  primaryMuscle: z.string(),
  equipment: z.string(),
  exerciseType: z.string(),
  rank: z.number().int(),
  thumbnailUrl: z.string().nullable(),
  retired: z.boolean(),
  updatedAt: z.string(),
});

const detail = catalogExerciseFields.extend({
  id: z.string(),
  thumbnailKey: z.string().nullable(),
  videoKey: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  videoUrl: z.string().nullable(),
  retired: z.boolean(),
  typeLocked: z.boolean(),
  updatedAt: z.string(),
});

async function detailOf(services: Services, id: string) {
  const row = await getCatalogRow(services.db, id);
  if (!row) throw new ORPCError("NOT_FOUND", { message: "No such catalog exercise" });
  return detail.parse({
    id: row.id,
    title: row.title,
    primaryMuscle: row.primaryMuscle,
    secondaryMuscles: row.secondaryMuscles,
    primaryDetail: row.primaryDetail,
    secondaryDetail: row.secondaryDetail,
    equipment: row.equipment,
    exerciseType: row.exerciseType,
    isFullBodyweight: row.isFullBodyweight,
    aka: row.aka,
    searchTerms: row.searchTerms,
    instructions: row.instructions,
    rank: row.rank,
    thumbnailKey: row.thumbnailKey,
    videoKey: row.videoKey,
    thumbnailUrl: publicUrl(services, row.thumbnailKey),
    videoUrl: publicUrl(services, row.videoKey),
    retired: row.retiredAt !== null,
    typeLocked: await exerciseTypeLocked(services.db, row.id),
    updatedAt: row.updatedAt.toISOString(),
  });
}

const list = catalogApi
  .meta(openapi({ method: "GET", path: "/admin/catalog", summary: "List catalog exercises" }))
  .input(
    z.object({
      search: z.string().trim().max(200).optional(),
      primaryMuscle: z.enum(MUSCLE_GROUPS).optional(),
      equipment: z.enum(EQUIPMENT).optional(),
      exerciseType: z.enum(EXERCISE_TYPES).optional(),
      retired: z.enum(["live", "retired", "all"]).default("live"),
      page: z.number().int().min(1).max(100_000).default(1),
      limit: z.number().int().min(1).max(100).default(50),
    }),
  )
  .output(z.object({ exercises: z.array(listRow), total: z.number().int() }))
  .handler(async ({ context, input }) => {
    const { rows, total } = await listCatalog(context.services.db, input);
    return {
      total,
      exercises: rows.map((row) => ({
        id: row.id,
        title: row.title,
        primaryMuscle: row.primaryMuscle,
        equipment: row.equipment,
        exerciseType: row.exerciseType,
        rank: row.rank,
        thumbnailUrl: publicUrl(context.services, row.thumbnailKey),
        retired: row.retiredAt !== null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  });

const get = catalogApi
  .meta(openapi({ method: "GET", path: "/admin/catalog/{id}", summary: "One catalog exercise" }))
  .input(byId)
  .output(detail)
  .handler(({ context, input }) => detailOf(context.services, input.id));

const create = catalogApi
  .meta(
    openapi({
      method: "POST",
      path: "/admin/catalog",
      summary: "Add a catalog exercise",
      description: "A live exercise needs an uploaded thumbnail; a retired one may have none.",
      successStatus: 201,
    }),
  )
  .use(writes)
  .input(
    z.object({
      exercise: catalogExerciseInput,
      thumbnailKey: mediaKey.nullable().default(null),
      videoKey: mediaKey.nullable().default(null),
      retired: z.boolean().default(false),
    }),
  )
  .output(detail)
  .handler(async ({ context, input }) => {
    const media: CatalogMediaKeys = { thumbnailKey: input.thumbnailKey, videoKey: input.videoKey };
    if (!media.thumbnailKey && (!input.retired || media.videoKey)) throw thumbnailRequired();
    await assertUploaded(context.services, media.thumbnailKey);
    await assertUploaded(context.services, media.videoKey);
    const { id } = await context.audited(
      (tx) => createCatalogExercise(tx, input.exercise, media, input.retired),
      (created) => ({
        action: "catalog.create",
        targetType: "exercise",
        targetId: created.id,
        detail: { title: input.exercise.title, retired: input.retired },
      }),
    );
    return detailOf(context.services, id);
  });

const update = catalogApi
  .meta(
    openapi({
      method: "PATCH",
      path: "/admin/catalog/{id}",
      summary: "Edit a catalog exercise",
      description:
        "Changes only the given fields. The type is locked once a set uses the exercise.",
    }),
  )
  .use(writes)
  .input(
    z.object({
      id: z.uuid(),
      patch: catalogExerciseFields
        .partial()
        .extend({ thumbnailKey: mediaKey.optional(), videoKey: mediaKey.nullable().optional() }),
    }),
  )
  .output(detail)
  .handler(async ({ context, input }) => {
    await assertUploaded(context.services, input.patch.thumbnailKey);
    await assertUploaded(context.services, input.patch.videoKey);
    await context.audited(
      (tx) => updateCatalogExercise(tx, input.id, input.patch),
      ({ changed }) => ({
        action: "catalog.update",
        targetType: "exercise",
        targetId: input.id,
        detail: { fields: changed },
      }),
    );
    return detailOf(context.services, input.id);
  });

const retire = catalogApi
  .meta(openapi({ method: "POST", path: "/admin/catalog/{id}/retire", summary: "Retire" }))
  .use(writes)
  .input(byId)
  .output(detail)
  .handler(async ({ context, input }) => {
    await context.audited(
      (tx) => setCatalogRetired(tx, input.id, true),
      () => ({ action: "catalog.retire", targetType: "exercise", targetId: input.id, detail: {} }),
    );
    return detailOf(context.services, input.id);
  });

const restore = catalogApi
  .meta(openapi({ method: "POST", path: "/admin/catalog/{id}/restore", summary: "Restore" }))
  .use(writes)
  .input(byId)
  .output(detail)
  .handler(async ({ context, input }) => {
    const current = await getCatalogRow(context.services.db, input.id);
    if (current && !current.thumbnailKey) throw thumbnailRequired();
    await context.audited(
      (tx) => setCatalogRetired(tx, input.id, false),
      () => ({ action: "catalog.restore", targetType: "exercise", targetId: input.id, detail: {} }),
    );
    return detailOf(context.services, input.id);
  });

/** The catalog as the committed seed file (`data/exercises.json`), retired rows included. */
const exportFile = catalogApi
  .meta(openapi({ method: "GET", path: "/admin/catalog/export", summary: "Export the seed file" }))
  .output(z.array(catalogRowSchema))
  .handler(({ context }) => exportCatalog(context.services.db));

/**
 * A presigned PUT for one exercise's thumbnail or video. Type and length are signed into the URL.
 * After the upload the client saves the returned key with create or update.
 */
const mediaUploadUrl = catalogApi
  .meta(
    openapi({
      method: "GET",
      path: "/admin/catalog/media-upload-url",
      summary: "Media upload URL",
    }),
  )
  .use(writes)
  .input(
    z.discriminatedUnion("slot", [
      z.object({
        slot: z.literal("thumbnail"),
        exerciseId: z.uuid().optional(),
        contentType: z.enum(EXERCISE_MEDIA_LIMITS.thumbnail.types),
        contentLength: z.number().int().min(1).max(EXERCISE_MEDIA_LIMITS.thumbnail.maxBytes),
      }),
      z.object({
        slot: z.literal("video"),
        exerciseId: z.uuid().optional(),
        contentType: z.enum(EXERCISE_MEDIA_LIMITS.video.types),
        contentLength: z.number().int().min(1).max(EXERCISE_MEDIA_LIMITS.video.maxBytes),
      }),
    ]),
  )
  .output(
    z.object({
      slot: exerciseMediaSlotSchema,
      key: z.string(),
      url: z.string(),
      headers: z.object({ "Content-Type": z.string(), "Content-Length": z.string() }),
      expiresAt: z.string(),
    }),
  )
  .handler(async ({ context, input }) => {
    const key = mediaKeyFor(input.slot, input.contentType, input.exerciseId);
    const signed = await context.services.exerciseMediaStore.signPut(key, {
      contentType: input.contentType,
      contentLength: input.contentLength,
      expiresInSeconds: MEDIA_UPLOAD_URL_SECONDS,
    });
    return {
      slot: input.slot,
      key,
      url: signed.url,
      headers: signed.headers,
      expiresAt: signed.expiresAt.toISOString(),
    };
  });

export const adminCatalogRouter = {
  list,
  get,
  create,
  update,
  retire,
  restore,
  export: exportFile,
  mediaUploadUrl,
};
