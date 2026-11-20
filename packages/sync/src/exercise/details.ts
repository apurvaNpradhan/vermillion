import { isMuscleDetail, type MuscleDetail } from "@workspace/shared";
import { z } from "zod";

/** PowerSync hands a Postgres array over as JSON text. */
const slugList = z.array(z.string());

/**
 * Muscle details from a column's JSON text. Lenient on purpose (ADR 0050): a slug this release
 * does not know is dropped and the row stays readable, so a later detail needs no release gate.
 * Missing or malformed text reads as no details.
 */
export function parseMuscleDetails(text: string | null | undefined): MuscleDetail[] {
  if (text === null || text === undefined) return [];
  try {
    const parsed = slugList.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.filter(isMuscleDetail) : [];
  } catch {
    return [];
  }
}
