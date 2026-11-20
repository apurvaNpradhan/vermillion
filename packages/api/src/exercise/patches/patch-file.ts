import {
  EQUIPMENT,
  EXERCISE_INSTRUCTIONS_MAX,
  EXERCISE_TITLE_MAX,
  EXERCISE_TYPES,
  MUSCLE_DETAIL_SLUGS,
  MUSCLE_GROUPS,
  semverSchema,
} from "@workspace/shared";
import { z } from "zod";

import { catalogRowSchema } from "../catalog-file";

/** The patch's own error: a file is refused whole, before anything is written. */
export class CatalogPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogPatchError";
  }
}

const mediaKey = z
  .string()
  .min(1)
  .refine((key) => !key.startsWith("/") && !key.includes("://") && !/\s/u.test(key), {
    error: "a media key is a relative path",
  });
/** Array values are sets: a repeated entry is a mistake in the file, not a different set. */
const noRepeats = (values: readonly string[]) => new Set(values).size === values.length;
const noRepeatsMessage = { error: "repeats an entry" };
const groups = z.array(z.enum(MUSCLE_GROUPS)).refine(noRepeats, noRepeatsMessage);
const details = z.array(z.enum(MUSCLE_DETAIL_SLUGS)).refine(noRepeats, noRepeatsMessage);
const rank = z.number().int().min(0).max(32_767);

/**
 * Fields a patch may fill, each only when the row's value is empty. No defaults here: an absent
 * field means "leave it", which a default would turn into "set it to empty".
 */
const fillSchema = z
  .strictObject({
    id: z.uuid(),
    secondary_muscles: groups.optional(),
    primary_detail: details.optional(),
    secondary_detail: details.optional(),
    rank: rank.optional(),
    search_terms: z.string().min(1).optional(),
    aka: z.string().min(1).optional(),
    instructions: z.string().min(1).max(EXERCISE_INSTRUCTIONS_MAX).optional(),
    video_key: mediaKey.optional(),
    thumbnail_key: mediaKey.optional(),
  })
  .refine((fill) => Object.keys(fill).length > 1, { error: "a fill names no field" });
export type PatchFill = z.infer<typeof fillSchema>;

function change<Field extends string, Value extends z.ZodType>(field: Field, value: Value) {
  return z.strictObject({ id: z.uuid(), field: z.literal(field), from: value, to: value });
}

/** A deliberate change: applied only if the row still holds `from` (arrays compared as sets). */
const changeSchema = z.discriminatedUnion("field", [
  change("equipment", z.enum(EQUIPMENT)),
  change("primary_muscle", z.enum(MUSCLE_GROUPS)),
  change("secondary_muscles", groups),
  change("rank", rank),
  change("exercise_type", z.enum(EXERCISE_TYPES)),
  change("title", z.string().min(1).max(EXERCISE_TITLE_MAX)),
  change("thumbnail_key", mediaKey.nullable()),
  change("video_key", mediaKey.nullable()),
]);
export type PatchChange = z.infer<typeof changeSchema>;

export const patchFileSchema = z.strictObject({
  /** The lowest app version that understands this patch's slugs; the gate waits for it. */
  requires_app_version: semverSchema.optional(),
  insert: z.array(catalogRowSchema).default([]),
  fill: z.array(fillSchema).default([]),
  change: z.array(changeSchema).default([]),
});
export type PatchFile = z.infer<typeof patchFileSchema>;

/** Parses a patch file's text; the message names the file and the rule, never a payload. */
export function parsePatchFile(name: string, text: string): PatchFile {
  let json: ReturnType<typeof JSON.parse>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new CatalogPatchError(`patch ${name}: not valid JSON`);
  }
  const parsed = patchFileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CatalogPatchError(
      `patch ${name}: ${issue?.path.join(".") ?? ""}: ${issue?.message ?? "invalid"}`,
    );
  }
  return parsed.data;
}
