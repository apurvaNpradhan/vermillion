import {
  EQUIPMENT,
  EXERCISE_INSTRUCTIONS_MAX,
  EXERCISE_TITLE_MAX,
  EXERCISE_TYPES,
  hasValidSecondaryMuscles,
  MUSCLE_GROUPS,
} from "@workspace/shared";
import { z } from "zod";

const mediaKey = z
  .string()
  .min(1)
  .refine((key) => !key.startsWith("/") && !key.includes("://") && !/\s/u.test(key), {
    error: "a media key is a relative path",
  });

/** One row of `data/exercises.json`, as `scripts/catalog/convert-catalog.ts` writes it. */
export const catalogRowSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().min(1).max(EXERCISE_TITLE_MAX),
  primary_muscle: z.enum(MUSCLE_GROUPS),
  secondary_muscles: z.array(z.enum(MUSCLE_GROUPS)),
  equipment: z.enum(EQUIPMENT),
  exercise_type: z.enum(EXERCISE_TYPES),
  is_full_bodyweight: z.boolean(),
  rank: z.number().int().min(0).max(32_767),
  search_terms: z.string().min(1).nullable(),
  aka: z.string().min(1).nullable(),
  instructions: z.string().min(1).max(EXERCISE_INSTRUCTIONS_MAX).nullable(),
  video_key: mediaKey.nullable(),
  thumbnail_key: mediaKey.nullable(),
  retired: z.boolean(),
});
export type CatalogRow = z.infer<typeof catalogRowSchema>;

/** The file's content is refused; the message names the row and the rule, never a payload. */
export class CatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogValidationError";
  }
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

/**
 * Parses and validates the whole file before anything is written: every row against the schema,
 * then the rules across rows (unique ids and titles, secondary muscles exclude the primary).
 */
export function parseCatalog(text: string): CatalogRow[] {
  let json: ReturnType<typeof JSON.parse>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new CatalogValidationError("catalog file is not valid JSON");
  }
  const parsed = z.array(catalogRowSchema).min(1).safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CatalogValidationError(
      `catalog row ${issue?.path.join(".") ?? ""}: ${issue?.message ?? "invalid"}`,
    );
  }
  const rows = parsed.data;
  const repeatedIds = duplicates(rows.map((row) => row.id));
  if (repeatedIds.length > 0) {
    throw new CatalogValidationError(`catalog has duplicate ids: ${repeatedIds.join(", ")}`);
  }
  const repeatedTitles = duplicates(rows.map((row) => row.title));
  if (repeatedTitles.length > 0) {
    throw new CatalogValidationError(`catalog has duplicate titles: ${repeatedTitles.join(", ")}`);
  }
  for (const row of rows) {
    if (!hasValidSecondaryMuscles(row)) {
      throw new CatalogValidationError(`catalog row ${row.id}: bad secondary muscles`);
    }
    if ((row.video_key === null) !== (row.thumbnail_key === null)) {
      throw new CatalogValidationError(`catalog row ${row.id}: video and thumbnail keys differ`);
    }
  }
  return rows;
}
