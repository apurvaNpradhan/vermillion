import type { PlannedSet } from "../plans/planned-sets";
import type { RuleId } from "../engine/rule-config";
import type { Equipment, ExerciseType } from "../../exercise/vocabulary";
import type { SessionHistory } from "../logging/logged-set";
import {
  isBaselinePhase,
  snapshotModifiers,
  type Phase,
  type PhaseSnapshot,
} from "../phases/phases";
import {
  resolveExerciseUnit,
  type PreviousSource,
  type WeightUnit,
} from "../vocabulary/vocabulary";
import { fixedPrescriptionHistory, suggestionHistory } from "./suggestion-history";
import { outsideLighterWeeks, type LighterPeriod } from "./lighter-week";
import { historyForGym } from "./gym-history";
import type { LoadGrid } from "./load-grid";
import { incrementInUnit } from "./progression-steps";
import { missedSuggestions, stalledSessions, wasStallDeload } from "./stalled-lift";

/** The increment settings plus what progression reads of the clock and the Lighter weeks. */
export type SuggestionSettings = {
  /** Fallback when history has no bodyweight snapshot. */
  bodyweightKg?: number | null;
  weightUnit: WeightUnit;
  weightIncrementKg: number | null;
  lighterWeeks?: readonly LighterPeriod[];
  /** The stalled-lift deload was applied to this exercise. */
  deload?: boolean;
  /** The share of the last load this week's phase asks for (0.9 in a Deload); 1 or absent: none. */
  phaseLoad?: number;
  testSingle?: boolean;
  /** History selected by the entry, Workout preference and gym. */
  baselineHistory?: readonly SessionHistory[];
  /** Whole baseline entries that match the fixed-rep prescription, newest first. */
  fixedBaselineHistory?: readonly SessionHistory[];
  /** The fixed-rep fallback when the general Previous preference is any Session. */
  fixedFallbackHistory?: readonly SessionHistory[];
  /** Machine, cable and Smith exercises prefer history from this gym for their baseline. */
  gymId?: string | null;
  /** The loads and cap of this gym for the exercise; null is the equipment default. */
  grid?: LoadGrid | null;
};

/** What an exercise's stalled note needs. */
export type StallInfo = {
  count: number;
  latestSessionId: string;
  applied: boolean;
  /**
   * The numbers have not stalled, but the suggestion was missed without gain every time: it asks
   * to hold or review the target, and never offers the lighter-load deload.
   */
  missed?: boolean;
};

/** A finished Session of an exercise, as a suggestion reads it. */
export type ContextSession = SessionHistory & { workoutId: string | null };

/** What the device remembers about a stalled lift's note. */
export type StallFlags = { dismissed: boolean };

/** The account and device side of a suggestion: preferences, the weight log and stall memory. */
export type SuggestionAccount = {
  previousSource: PreviousSource;
  /** The account's weight unit; an exercise may override it. */
  unit: WeightUnit;
  weightIncrementKg: number | null;
  weightIncrementUnit?: WeightUnit | null;
  lighterWeeks: readonly LighterPeriod[];
  bodyweightKg: number | null;
  stallMemory: (exerciseId: string, latestSessionId: string) => StallFlags;
};

/** Where and with what an exercise is about to be trained. */
export type SuggestionPlace = {
  exerciseId: string;
  type: ExerciseType;
  sourceWorkoutExerciseId?: string | null;
  exerciseOrdinal?: number;
  duplicateEntry?: boolean;
  equipment: Equipment;
  /** The exercise's own unit, when it overrides the account's. */
  unitOverride?: WeightUnit | null;
  /** The Workout the exercise is trained in; null when there is none. */
  workoutId: string | null;
  /** The gym trained at (the Session's gym, or the active one for a screen); null when unknown. */
  gymId: string | null;
  /** This week's phase load share (0.9 in a Deload); 1 or absent: none. */
  phaseLoad?: number;
  testSingle?: boolean;
  /** The loads this gym can make for the exercise. */
  grid: LoadGrid | null;
  /** Judge the stalled-lift note and apply an accepted deload (only for an exercise to train). */
  stalls: boolean;
  stallDeload?: boolean;
  /** The exercise's rule id; a maintained lift is never reported as stalled. */
  rule?: RuleId | null;
  prescription?: readonly PlannedSet[];
};

export type SuggestionContext = {
  unit: WeightUnit;
  settings: SuggestionSettings;
  /** The stalled-lift verdict for this Workout's Sessions; null when none, or dismissed. */
  stall: StallInfo | null;
  /** The Sessions Previous and the hints read: the baseline of the Session's gym. */
  history: readonly ContextSession[];
};

/** The load factor of the phase a Session started in; 1 for none (the engine's own numbers). */
export function phaseLoadOf(
  phase: Phase | null,
  snapshot: PhaseSnapshot | null | undefined,
): number {
  return phase === null ? 1 : snapshotModifiers(phase, snapshot).modifiers.load;
}

/**
 * The one way every surface builds a suggestion's inputs (the Session, the live notification,
 * the Workout preview and the exercise page): the baseline of the Previous preference and gym,
 * the stalled-lift verdict of this Workout and the deload it applied, the Lighter weeks, the
 * phase and the grid. Pure: the device's stall memory and the weight log come in as values.
 */
export function suggestionContext(
  rawHistory: readonly ContextSession[],
  place: SuggestionPlace,
  account: SuggestionAccount,
): SuggestionContext {
  const { history, workoutHistory, anyWorkout } = suggestionHistory(
    rawHistory,
    place,
    account.previousSource,
  );
  const fixedBaselineHistory = fixedPrescriptionHistory(
    outsideLighterWeeks(anyWorkout, account.lighterWeeks).filter((session) =>
      isBaselinePhase(session.phase),
    ),
    place.prescription ?? [],
  );
  let stall: StallInfo | null = null;
  if (place.stalls && !place.testSingle && place.rule !== "maintain") {
    // Stalls compare Sessions of this Workout across gyms, regardless of the Previous preference.
    const sessions = workoutHistory;
    const latestSessionId = sessions[0]?.id ?? null;
    const count = stalledSessions(sessions, place.type, {
      bodyweightKg: account.bodyweightKg,
      lighterWeeks: account.lighterWeeks,
      sinceDeload: fixedBaselineHistory.find(wasStallDeload)?.started_at,
    });
    const missed = missedSuggestions(sessions, place.type, {
      bodyweightKg: account.bodyweightKg,
      lighterWeeks: account.lighterWeeks,
      sinceDeload: fixedBaselineHistory.find(wasStallDeload)?.started_at,
    });
    if (latestSessionId !== null && (count > 0 || missed > 0 || place.stallDeload)) {
      const memory = account.stallMemory(place.exerciseId, latestSessionId);
      if (!memory.dismissed || place.stallDeload)
        stall = {
          count: count > 0 ? count : missed,
          latestSessionId,
          applied: place.stallDeload === true,
          ...(count === 0 && missed > 0 ? { missed: true } : {}),
        };
    }
  }
  const unit = resolveExerciseUnit(account.unit, place.unitOverride ?? null);
  return {
    unit,
    stall,
    history,
    settings: {
      bodyweightKg: account.bodyweightKg,
      baselineHistory: history,
      fixedBaselineHistory,
      fixedFallbackHistory:
        place.workoutId !== null &&
        account.previousSource === "any_session" &&
        workoutHistory.length > 0
          ? historyForGym(workoutHistory, place.gymId, place.equipment)
          : undefined,
      weightUnit: unit,
      weightIncrementKg: incrementInUnit(
        account.weightIncrementKg,
        account.weightIncrementUnit ?? account.unit,
        unit,
      ),
      gymId: place.gymId,
      grid: place.grid,
      lighterWeeks: account.lighterWeeks,
      deload: place.stallDeload === true,
      phaseLoad: place.phaseLoad ?? 1,
      testSingle: place.testSingle,
    },
  };
}
