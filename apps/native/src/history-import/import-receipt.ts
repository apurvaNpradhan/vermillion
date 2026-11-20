import { z } from "zod";

/** What the last import did, kept on this device so the receipt can be opened again. */
const receiptSchema = z.object({
  batchId: z.uuid(),
  importedAt: z.iso.datetime(),
  format: z.enum(["strong", "hevy"]),
  sessions: z.number().int().min(0),
  sets: z.number().int().min(0),
  createdExercises: z.number().int().min(0),
  skippedDuplicates: z.number().int().min(0),
  /** Workouts left out for another reason: no usable set, or outside the last 10 years. */
  skippedOther: z.number().int().min(0),
  from: z.iso.datetime().nullable(),
  to: z.iso.datetime().nullable(),
});
export type ImportReceipt = z.infer<typeof receiptSchema>;

/** The saved receipt, or null when there is none or it is unreadable. */
export function parseReceipt(text: string | null): ImportReceipt | null {
  if (text === null) return null;
  try {
    const parsed = receiptSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
