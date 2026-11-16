import { z } from "zod";

/** Keypad drafts may be incomplete while typing. Inches retain hundredths, like the stepper. */
export function acceptsMeasurementDraft(value: string, unit: string): boolean {
  return z
    .string()
    .regex(unit === "in" ? /^\d*(\.\d{0,2})?$/ : /^\d*(\.\d?)?$/)
    .safeParse(value).success;
}
