import type { Equipment, ExerciseType } from "../../exercise/vocabulary";
import { isCounted, type LoggedSet, type SessionHistory } from "../logging/logged-set";
import { snapshotModifiers, type Phase, type PhaseSnapshot } from "../phases/phases";
import {
  resolveExerciseUnit,
  type PreviousSource,
  type WeightUnit,
} from "../vocabulary/vocabulary";
import { exerciseEntries, suggestionHistory } from "./suggestion-history";
import type { LighterPeriod } from "./lighter-week";
import type { LoadGrid } from "./load-grid";
import { incrementInUnit } from "./progression-steps";
import { stalledSessions } from "./stalled-lift";

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
  /** History selected by the entry, Workout preference and gym. */
  baselineHistory?: readonly SessionHistory[];
  /** Machine, cable and Smith exercises prefer history from this gym for their baseline. */
  gymId?: string | null;
  /** The loads and cap of this gym for the exercise; null is the equipment default. */
  grid?: LoadGrid | null;
};

/** What an exercise's stalled note needs. */
export type StallInfo = { count: number; latestSessionId: string; applied: boolean };

/** A finished Session of an exercise, as a suggestion reads it. */
export type ContextSession = SessionHistory & { workoutId: string | null };

/** What the device remembers about a stalled lift's note. */
export type StallFlags = { dismissed: boolean; applied: boolean };

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
  /** The loads this gym can make for the exercise. */
  grid: LoadGrid | null;
  /** Judge the stalled-lift note and apply an accepted deload (only for an exercise to train). */
  stalls: boolean;
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
  const { history, workoutHistory } = suggestionHistory(rawHistory, place, account.previousSource);
  let stall: StallInfo | null = null;
  if (place.stalls) {
    // Stalls compare Sessions of this Workout across gyms, regardless of the Previous preference.
    const sessions = workoutHistory;
    const latestSessionId = sessions[0]?.id ?? null;
    const count = stalledSessions(sessions, place.type, {
      bodyweightKg: account.bodyweightKg,
      lighterWeeks: account.lighterWeeks,
    });
    if (latestSessionId !== null && count > 0) {
      const memory = account.stallMemory(place.exerciseId, latestSessionId);
      if (!memory.dismissed || memory.applied)
        stall = { count, latestSessionId, applied: memory.applied };
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
      weightUnit: unit,
      weightIncrementKg: incrementInUnit(
        account.weightIncrementKg,
        account.weightIncrementUnit ?? account.unit,
        unit,
      ),
      gymId: place.gymId,
      grid: place.grid,
      lighterWeeks: account.lighterWeeks,
      deload: stall?.applied === true,
      phaseLoad: place.phaseLoad ?? 1,
    },
  };
}

/** The exercises trained this week with a visible stall on at least one of their entries. */
export function stalledExerciseIds(
  thisWeek: readonly Pick<ContextSession, "workoutId" | "gymId" | "sets">[],
  histories: ReadonlyMap<string, readonly ContextSession[]>,
  account: SuggestionAccount,
): string[] {
  const stalled = new Set<string>();
  for (const session of thisWeek) {
    const exercises = new Map<string, LoggedSet[]>();
    for (const set of session.sets) {
      if (stalled.has(set.exercise_id)) continue;
      const sets = exercises.get(set.exercise_id) ?? [];
      sets.push(set);
      exercises.set(set.exercise_id, sets);
    }
    for (const [exerciseId, sets] of exercises) {
      const history = histories.get(exerciseId);
      if (!history) continue;
      const entries = exerciseEntries(sets);
      for (const [exerciseOrdinal, entry] of entries.entries()) {
        const set = entry.find(isCounted);
        if (!set) continue;
        const { stall } = suggestionContext(
          history,
          {
            exerciseId,
            sourceWorkoutExerciseId: set.source_workout_exercise_id,
            exerciseOrdinal,
            duplicateEntry: entries.length > 1,
            type: set.exercise_type,
            workoutId: session.workoutId,
            gymId: session.gymId ?? null,
            // The stall verdict compares this Workout's history across gyms and ignores load grids.
            equipment: "other",
            grid: null,
            stalls: true,
          },
          account,
        );
        if (stall) {
          stalled.add(exerciseId);
          break;
        }
      }
    }
  }
  return [...stalled];
}
