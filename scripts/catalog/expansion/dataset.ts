// Reads the earlier dataset (untrusted: parsed and validated, never executed) into one flat shape.
import { z } from "zod";

import { isSourceMuscle, type SourceMuscle } from "./muscles.ts";

const named = z.array(z.strictObject({ id: z.string().min(1), name: z.string().min(1) }));

const sourceRow = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  exercise_type: z.enum(["weight_reps", "duration", "distance_duration"]),
  image_key: z.string().nullable(),
  video_key: z.string().nullable(),
  body_part_ids: z.array(z.string()),
  equipment_ids: z.array(z.string()),
  primary_muscle_ids: z.array(z.string()),
  secondary_muscle_ids: z.array(z.string()),
});

export type SourceType = z.infer<typeof sourceRow>["exercise_type"];

export type SourceExercise = {
  id: string;
  name: string;
  type: SourceType;
  videoKey: string | null;
  imageKey: string | null;
  bodyParts: string[];
  /** Equipment names in the order the dataset lists them. */
  equipment: string[];
  primary: SourceMuscle[];
  secondary: SourceMuscle[];
};

/** The first four digits of a media file name: the movement id shared with the catalog. */
export function movementId(key: string | null): string | null {
  if (key === null) return null;
  const file = key.split("/").at(-1) ?? "";
  return /(\d{4})\d{4}-/.exec(file)?.[1] ?? null;
}

/** The movement id of a source row (video first, then its picture). */
export function sourceMovement(row: SourceExercise): string | null {
  return movementId(row.videoKey) ?? movementId(row.imageKey);
}

function lookup(table: z.infer<typeof named>, label: string): (id: string) => string {
  const names = new Map(table.map((entry) => [entry.id, entry.name]));
  return (id) => {
    const name = names.get(id);
    if (name === undefined) throw new Error(`dataset: unknown ${label} id ${id}`);
    return name;
  };
}

export type DatasetText = {
  exercises: string;
  muscles: string;
  equipment: string;
  bodyParts: string;
};

function parseJson(text: string, label: string): ReturnType<typeof JSON.parse> {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`dataset: ${label} is not valid JSON`);
  }
}

/** Parses the four dataset files; any malformed row or unknown muscle name fails the run. */
export function parseDataset(files: DatasetText): SourceExercise[] {
  const muscleName = lookup(named.parse(parseJson(files.muscles, "muscles")), "muscle");
  const equipmentName = lookup(named.parse(parseJson(files.equipment, "equipment")), "equipment");
  const bodyPartName = lookup(named.parse(parseJson(files.bodyParts, "body parts")), "body part");
  const muscles = (ids: string[]): SourceMuscle[] =>
    ids.map((id) => {
      const name = muscleName(id);
      if (!isSourceMuscle(name)) throw new Error(`dataset: unmapped muscle ${name}`);
      return name;
    });
  return files.exercises
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      const parsed = sourceRow.safeParse(parseJson(line, `exercise line ${index + 1}`));
      if (!parsed.success) {
        throw new Error(`dataset: exercise line ${index + 1}: ${parsed.error.issues[0]?.message}`);
      }
      const row = parsed.data;
      return {
        id: row.id,
        name: row.name,
        type: row.exercise_type,
        videoKey: row.video_key,
        imageKey: row.image_key,
        bodyParts: row.body_part_ids.map(bodyPartName),
        equipment: row.equipment_ids.map(equipmentName),
        primary: muscles(row.primary_muscle_ids),
        secondary: muscles(row.secondary_muscle_ids),
      };
    });
}
