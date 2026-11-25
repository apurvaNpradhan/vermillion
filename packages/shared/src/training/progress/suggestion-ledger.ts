import { loadIdentity } from "../vocabulary/format";
import type { Prescription } from "./prescription";

/** What was offered for one set: its load before any same-day adjustment, and its reps. */
export type OfferedSet = { weight_kg: number | null; reps: number | null };

/** The load and reps a set was logged at. */
export type DoneSet = { weight_kg?: number | null; reps?: number | null };

/** What a snapshot offered for a set; the load is the one before a same-day adjustment moved it. */
export function suggestedFromSnapshot(snapshot: Prescription, setId: string): OfferedSet | null {
  const saved = snapshot.sets.find(({ id }) => id === setId);
  return saved
    ? {
        weight_kg: saved.unadjustedWeightKg ?? saved.ghosts.weight ?? null,
        reps: saved.ghosts.reps ?? null,
      }
    : null;
}

/** A set fell short of what was suggested: less load, or fewer reps. A blank value never does. */
export function fellShortOfSuggestion(suggested: OfferedSet, done: DoneSet): boolean {
  const lighter =
    suggested.weight_kg !== null &&
    done.weight_kg != null &&
    loadIdentity(done.weight_kg) < loadIdentity(suggested.weight_kg);
  const fewer = suggested.reps !== null && done.reps != null && done.reps < suggested.reps;
  return lighter || fewer;
}

export type SuggestionLedger = {
  /** The first working set the suggestion covered: what it offered and what was done. */
  suggested: OfferedSet;
  done: DoneSet;
  /** Working sets done that the suggestion covered, and how many of them it was met on. */
  total: number;
  met: number;
};

/**
 * One exercise's suggestion against its work, for the finished Session: the first covered working
 * set as the example, and how many of the covered working sets met it. Null when there was no
 * snapshot, or no covered working set was done.
 */
export function suggestionLedger(
  snapshot: Prescription | null | undefined,
  sets: readonly (DoneSet & { id: string; kind: string; completed: boolean })[],
): SuggestionLedger | null {
  if (!snapshot) return null;
  let first: SuggestionLedger | null = null;
  let total = 0;
  let met = 0;
  for (const set of sets) {
    if (!set.completed || set.kind !== "working") continue;
    const suggested = suggestedFromSnapshot(snapshot, set.id);
    if (!suggested) continue;
    total += 1;
    if (!fellShortOfSuggestion(suggested, set)) met += 1;
    first ??= { suggested, done: { weight_kg: set.weight_kg, reps: set.reps }, total: 0, met: 0 };
  }
  return first ? { ...first, total, met } : null;
}
