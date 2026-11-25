import { usesGymHistory, type Equipment } from "@workspace/shared";

import { usePreferences } from "@/preferences";

import { capPromptKey, noteLoggedLoad } from "./cap-prompt";
import type { GymLoads } from "./gym-loads";

/** Track repeated reductions only for equipment where the machine or rack can run out of load. */
export function useLoggedLoad(gym: GymLoads) {
  const { updateUi } = usePreferences();
  return (input: {
    sessionId: string;
    exerciseId: string;
    equipment: Equipment;
    suggestedKg: number;
    loggedKg: number;
  }) => {
    if (gym.gymId === null || (!usesGymHistory(input.equipment) && input.equipment !== "dumbbell"))
      return;
    if (gym.gridFor(input.exerciseId, input.equipment)?.capKg != null) return;
    const key = capPromptKey(gym.gymId, input.exerciseId);
    void updateUi(({ capPrompts }) => {
      const next = noteLoggedLoad(capPrompts, { key, ...input });
      return next ? { capPrompts: next } : null;
    }).catch(() => undefined);
  };
}
