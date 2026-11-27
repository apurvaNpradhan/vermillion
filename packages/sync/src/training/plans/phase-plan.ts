import {
  insertedDeloadsSchema,
  phasePlanSchema,
  phaseSnapshotSchema,
  type PhasePlan,
  type PhaseSnapshot,
} from "@workspace/shared";

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

/**
 * A plan as a column returns it (the column parses its JSON). The same rule as
 * {@link parsePhasePlan}: one this build cannot read counts as none, and keys it does not know
 * are dropped.
 */
export function readPhasePlan(value: PhasePlan | null | undefined): PhasePlan | null {
  if (value == null) return null;
  const plan = phasePlanSchema.safeParse(value);
  return plan.success ? plan.data : null;
}

/** The inserted Deload weeks of a column; anything unreadable is none. */
export function readInsertedDeloads(value: readonly number[] | null | undefined): number[] {
  return insertedDeloadsSchema.catch([]).parse(value ?? []);
}

/** A Session's phase modifiers from its JSON text; unreadable counts as none (the preset). */
export function parsePhaseSnapshot(text: string | null | undefined): PhaseSnapshot | null {
  if (text == null) return null;
  try {
    const snapshot = phaseSnapshotSchema.safeParse(JSON.parse(text));
    return snapshot.success ? snapshot.data : null;
  } catch {
    return null;
  }
}
