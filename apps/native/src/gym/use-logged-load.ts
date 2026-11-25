import { useCallback } from "react";
import { usesGymHistory, type Equipment } from "@workspace/shared";

import { usePreferences } from "@/preferences";

import { capPromptKey, noteLoggedLoad } from "./cap-prompt";
import { useMaxPromptStore } from "./max-prompt-store";
import { useGyms } from "./use-gyms";

/**
 * Returns the function a Session calls when a working set is ticked: it learns whether the user
 * keeps lowering the suggested weight to the same value, and asks about the max after the second
 * Session. Only for equipment with a stack or a rack, where a max exists.
 */
export function useLoggedLoad() {
  const { activeGymId } = useGyms();
  const { preferences, setUi } = usePreferences();
  const ask = useMaxPromptStore((state) => state.ask);
  const prompts = preferences.ui.capPrompts;
  return useCallback(
    (input: {
      sessionId: string;
      exerciseId: string;
      equipment: Equipment;
      suggestedKg: number;
      loggedKg: number;
    }) => {
      if (activeGymId === null) return;
      if (!usesGymHistory(input.equipment) && input.equipment !== "dumbbell") return;
      const key = capPromptKey(activeGymId, input.exerciseId);
      const note = noteLoggedLoad(prompts, { key, ...input });
      if (JSON.stringify(note.prompts) !== JSON.stringify(prompts))
        setUi({ capPrompts: note.prompts });
      if (note.ask) ask({ exerciseId: input.exerciseId, gymId: activeGymId, kg: input.loggedKg });
    },
    [activeGymId, prompts, setUi, ask],
  );
}
