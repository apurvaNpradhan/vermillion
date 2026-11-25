import {
  isTestSingle,
  prescribe,
  type ContextSession,
  type LoadGrid,
  type Phase,
  type PrescribeInput,
  type Prescribed,
  type SuggestionAccount,
} from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";

/** What a Session surface knows about an entry besides the entry itself. */
export type SessionPrescriptionContext = {
  workoutId: string | null;
  /** The Session gym; null when it has none. */
  gymId: string | null;
  grid: LoadGrid | null;
  /** This Session's phase load share (0.9 in a Deload); 1 is none. */
  phaseLoad: number;
  phase: Phase | null | undefined;
  /** The entry the Test week turned into a single. */
  testEntryId: string | undefined;
  exerciseOrdinal: number;
  duplicateEntry: boolean;
  /** Judge the stalled-lift note (not on a finished Session). */
  stalls: boolean;
  /** Suggest at all; false only reads the context. */
  suggest: boolean;
  now?: Date;
};

/** The entry's planned sets as the engine reads them. */
export const sessionPlan = (exercise: SessionExerciseDetail) =>
  exercise.sets.map(({ kind, target }) => ({ ...target, kind }));

/** What the engine is asked for one Session entry; the preview of a rule asks the same. */
export function sessionPrescribeInput(
  exercise: SessionExerciseDetail,
  history: readonly ContextSession[],
  account: SuggestionAccount,
  context: SessionPrescriptionContext,
): PrescribeInput {
  const plan = sessionPlan(exercise);
  return {
    place: {
      exerciseId: exercise.exerciseId,
      sourceWorkoutExerciseId: exercise.sourceWorkoutExerciseId,
      exerciseOrdinal: context.exerciseOrdinal,
      duplicateEntry: context.duplicateEntry,
      type: exercise.type,
      equipment: exercise.exercise?.equipment ?? "other",
      unitOverride: exercise.unit,
      workoutId: context.workoutId,
      gymId: context.gymId,
      phaseLoad: context.phaseLoad,
      grid: context.grid,
      // A lift that has stalled shows one quiet note; applying it suggests 90% for today.
      stalls: context.stalls && Boolean(exercise.sourceWorkoutExerciseId),
      stallDeload: exercise.stallDeload,
      testSingle:
        context.testEntryId === exercise.sourceWorkoutExerciseId &&
        isTestSingle(context.phase, plan),
    },
    plan,
    history,
    account,
    rule: exercise.rule,
    progressionPerSet: exercise.progressionPerSet,
    now: context.now,
    snapshot: {
      prescription: exercise.prescription,
      setIds: exercise.sets.map(({ id }) => id),
    },
    suggest: context.suggest && Boolean(exercise.sourceWorkoutExerciseId),
  };
}

/**
 * The prescription of one Session entry: the same call for the Session screen and the live
 * notification, so the Done button ticks the value the screen shows. A snapshot the Session
 * captured is read back, never recomputed.
 */
export function sessionPrescription(
  exercise: SessionExerciseDetail,
  history: readonly ContextSession[],
  account: SuggestionAccount,
  context: SessionPrescriptionContext,
): Prescribed {
  return prescribe(sessionPrescribeInput(exercise, history, account, context));
}
