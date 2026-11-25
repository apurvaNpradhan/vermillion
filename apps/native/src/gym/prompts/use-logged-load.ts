import { usesGymHistory, type Equipment, type SetOutcome } from "@workspace/shared";

import { usePreferences } from "@/preferences";

import { capPromptKey, noteLoggedLoad } from "./cap-prompt";
import type { GymLoads } from "../gym-loads";
import {
  noteOverride,
  observeRepRange,
  observeStep,
  rangePromptKey,
  stepPromptKey,
  type RangeSet,
} from "./override-prompt";

/** What a ticked progressing set says, and what its exercise's sets say as a whole. */
export type LoggedLoad = {
  sessionId: string;
  exerciseId: string;
  equipment: Equipment;
  suggestedKg: number | null;
  loggedKg: number | null;
  /** The suggestion's outcome for this set, from the snapshot. */
  outcome: Pick<SetOutcome, "reason" | "changeKg"> | null;
  /** The exercise's sets as they stand after this tick, for the rep range. */
  sets: readonly RangeSet[];
  /** The Workout exercise the Session came from; the rep range belongs to it. */
  workoutExerciseId: string | null;
};

/**
 * Track what a logged progressing set did against what was suggested, so the same override twice
 * can ask one question: the max (a machine or rack that runs out), the step (a stack that moves by
 * another amount) or the rep range (reps that keep passing it, judged over the whole exercise).
 */
export function useLoggedLoad(gym: GymLoads) {
  const { updateUi } = usePreferences();
  return (input: LoggedLoad) => {
    const { gymId } = gym;
    const { sessionId, exerciseId, equipment, workoutExerciseId } = input;
    const known = input.suggestedKg !== null && input.loggedKg !== null;
    const capKey = gymId === null ? null : capPromptKey(gymId, exerciseId);
    const capsTracked =
      gymId !== null &&
      known &&
      (usesGymHistory(equipment) || equipment === "dumbbell") &&
      gym.gridFor(exerciseId, equipment)?.capKg == null;
    // A stack that is not a free weight's rack can have a step of its own.
    const step =
      gymId !== null && known && usesGymHistory(equipment)
        ? observeStep({
            suggestedKg: input.suggestedKg ?? 0,
            loggedKg: input.loggedKg ?? 0,
            outcome: input.outcome,
          })
        : null;
    const range = workoutExerciseId === null ? null : observeRepRange(input.sets);
    if (!capsTracked && step === null && range === null) return;
    void updateUi(({ capPrompts, overridePrompts }) => {
      const nextCaps =
        capsTracked && capKey !== null
          ? noteLoggedLoad(capPrompts, {
              key: capKey,
              sessionId,
              suggestedKg: input.suggestedKg ?? 0,
              loggedKg: input.loggedKg ?? 0,
            })
          : null;
      let overrides = overridePrompts;
      let changed = false;
      const observed = [
        gymId === null ? null : ([stepPromptKey(gymId, exerciseId), "step", step] as const),
        workoutExerciseId === null
          ? null
          : ([rangePromptKey(workoutExerciseId), "range", range] as const),
      ];
      for (const entry of observed) {
        if (!entry) continue;
        const [key, kind, observation] = entry;
        const next = noteOverride(overrides, { key, kind, sessionId, observation });
        if (next) {
          overrides = next;
          changed = true;
        }
      }
      if (!nextCaps && !changed) return null;
      return {
        ...(nextCaps ? { capPrompts: nextCaps } : {}),
        ...(changed ? { overridePrompts: overrides } : {}),
      };
    }).catch(() => undefined);
  };
}
