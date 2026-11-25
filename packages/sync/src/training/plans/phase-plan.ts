import { phasePlanSchema, type PhasePlan } from "@workspace/shared";

/** A Program's phases from its JSON text; a plan this build cannot read counts as none. */
export function parsePhasePlan(text: string | null | undefined): PhasePlan | null {
  if (text == null) return null;
  try {
    const plan = phasePlanSchema.safeParse(JSON.parse(text));
    return plan.success ? plan.data : null;
  } catch {
    return null;
  }
}
