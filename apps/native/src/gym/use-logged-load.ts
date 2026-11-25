import { usesGymHistory, type Equipment, type SetOutcome } from "@workspace/shared";

import { usePreferences } from "@/preferences";

import { capPromptKey, noteLoggedLoad } from "./cap-prompt";
import type { GymLoads } from "./gym-loads";
import { noteOverride, observeReps, observeStep, overridePromptKey } from "./override-prompt";

/**
 * Track what a logged working set did against what was suggested, so the same override twice can
 * ask one question: the max (a machine or rack that runs out), the step (a stack that moves by
 * another amount) or the rep range (reps that keep passing it).
 */
export function useLoggedLoad(gym: GymLoads) {
  const { updateUi } = usePreferences();
  return (input: {
    sessionId: string;
    exerciseId: string;
    equipment: Equipment;
    suggestedKg: number;
    loggedKg: number;
    /** The suggestion's outcome for this set, from the snapshot. */
    outcome: Pick<SetOutcome, "reason" | "changeKg"> | null;
    loggedReps: number | null;
    /** The top of the planned rep range of this set. */
    targetRepsMax: number | null;
  }) => {
    if (gym.gymId === null) return;
    const { gymId } = gym;
    const { sessionId, exerciseId, equipment } = input;
    const capKey = capPromptKey(gymId, exerciseId);
    const capsTracked =
      (usesGymHistory(equipment) || equipment === "dumbbell") &&
      gym.gridFor(exerciseId, equipment)?.capKg == null;
    // A stack that is not a free weight's rack can have a step of its own.
    const step = usesGymHistory(equipment) ? observeStep(input) : null;
    const range = observeReps({ loggedReps: input.loggedReps, targetMax: input.targetRepsMax });
    if (!capsTracked && step === null && range === null) return;
    void updateUi(({ capPrompts, overridePrompts }) => {
      const nextCaps = capsTracked ? noteLoggedLoad(capPrompts, { key: capKey, ...input }) : null;
      let overrides = overridePrompts;
      let changed = false;
      for (const [kind, observation] of [
        ["step", step],
        ["range", range],
      ] as const) {
        const next = noteOverride(overrides, {
          key: overridePromptKey(gymId, exerciseId, kind),
          kind,
          sessionId,
          observation,
        });
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
