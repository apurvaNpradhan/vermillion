import { loadIdentity } from "../vocabulary/format";
import type { SetKind } from "../vocabulary/vocabulary";
import { estimatedOneRepMax, repsInReserve } from "../volume/volume";
import type { Prescription } from "./prescription";
import { progresses } from "./progression";

/** A whole rep below the suggestion, give or take the rounding of an estimate. */
const SHORT_BY = 1 - 1e-6;
/** Half a rep: a lighter set has to make up for its load by at least this. */
const LIGHTER_BY = 0.5 - 1e-6;

/** What was offered for one set: its load before any same-day adjustment, and its reps. */
export type OfferedSet = { weight_kg: number | null; reps: number | null };

/** The load and reps a set was logged at, and the effort when it was logged. */
export type DoneSet = { weight_kg?: number | null; reps?: number | null; rpe?: number | null };

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

/**
 * Reps the done set is worth at `loadKg`, by estimated 1RM (Brzycki): 100 × 8 is worth about
 * 8.8 reps at 100 when it was done as 110 × 6. With the set's effort logged, the reps left in
 * reserve are part of its strength and come off again, so a set is worth what it was at the same
 * effort: 110 × 6 at RPE 8 is a 8-rep set at 110, worth about 9.8 reps at 100, done at that
 * effort. Null beyond what the estimate covers.
 */
export function repsAtLoad(
  done: { weight_kg: number; reps: number; rpe?: number | null },
  loadKg: number,
) {
  const estimate = estimatedOneRepMax(done.weight_kg, done.reps, done.rpe);
  return estimate === null || loadKg <= 0
    ? null
    : 37 - (36 * loadKg) / estimate - repsInReserve(done.rpe);
}

/**
 * How many reps better (positive) or worse a done set was than the suggested one, on the
 * suggested load. At the same load that is the difference in reps; at another load the done set is
 * converted by estimated 1RM, so a heavier set with fewer reps is not a miss. Null when a value is
 * blank or the estimate cannot say.
 */
export function repsAgainstSuggestion(suggested: OfferedSet, done: DoneSet): number | null {
  if (suggested.reps === null || done.reps == null) return null;
  if (
    suggested.weight_kg === null ||
    done.weight_kg == null ||
    loadIdentity(done.weight_kg) === loadIdentity(suggested.weight_kg)
  )
    return done.reps - suggested.reps;
  const worth = repsAtLoad(
    { weight_kg: done.weight_kg, reps: done.reps, rpe: done.rpe },
    suggested.weight_kg,
  );
  return worth === null ? null : worth - suggested.reps;
}

/**
 * A set fell short of what was suggested. At the suggested load that is fewer reps. A lighter set
 * falls short unless its extra reps are worth it by estimated 1RM; a heavier set only when it is
 * worth a whole rep less, so a lifter who always adds 5 kg is not "missing". A blank value never
 * falls short, and reps past what the estimate covers are judged on the load alone.
 */
export function fellShortOfSuggestion(suggested: OfferedSet, done: DoneSet): boolean {
  const lighter =
    suggested.weight_kg !== null &&
    done.weight_kg != null &&
    loadIdentity(done.weight_kg) < loadIdentity(suggested.weight_kg);
  const gap = repsAgainstSuggestion(suggested, done);
  if (gap === null)
    return lighter && (suggested.reps === null || done.reps == null || done.reps <= suggested.reps);
  const other =
    suggested.weight_kg !== null &&
    done.weight_kg != null &&
    loadIdentity(done.weight_kg) !== loadIdentity(suggested.weight_kg);
  if (!other) return gap < 0;
  return lighter
    ? gap <= -LIGHTER_BY || done.reps == null || done.reps <= (suggested.reps ?? 0)
    : gap <= -SHORT_BY;
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
 * One exercise's suggestion against its work, for the finished Session: the first covered
 * progressing set as the example, and how many of the covered ones met it. Null when there was no
 * snapshot, or no covered working set was done.
 */
export function suggestionLedger(
  snapshot: Prescription | null | undefined,
  sets: readonly (DoneSet & { id: string; kind: SetKind; completed: boolean })[],
): SuggestionLedger | null {
  if (!snapshot) return null;
  let first: SuggestionLedger | null = null;
  let total = 0;
  let met = 0;
  for (const set of sets) {
    if (!set.completed || !progresses(set.kind)) continue;
    const suggested = suggestedFromSnapshot(snapshot, set.id);
    if (!suggested) continue;
    total += 1;
    if (!fellShortOfSuggestion(suggested, set)) met += 1;
    first ??= {
      suggested,
      done: { weight_kg: set.weight_kg, reps: set.reps, rpe: set.rpe },
      total: 0,
      met: 0,
    };
  }
  return first ? { ...first, total, met } : null;
}
