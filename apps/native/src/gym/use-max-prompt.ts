import { useCallback } from "react";
import { dismissCapPrompt, capPromptKey } from "./cap-prompt";
import type { Equipment, WeightUnit } from "@workspace/shared";

import { usePreferences } from "@/preferences";

import { useGymSetting } from "./use-gym-setting";
import { useMaxPromptStore } from "./max-prompt-store";

/** Answers the inline max question: yes sets the max, either answer ends the question for good. */
export function useMaxPrompt(exerciseId: string, equipment: Equipment, unit: WeightUnit) {
  const { preferences, setUi } = usePreferences();
  const setting = useGymSetting(exerciseId, equipment, unit);
  const clear = useMaxPromptStore((state) => state.clear);
  const dismiss = useCallback(
    (asking: { gymId: string; exerciseId: string }) => {
      setUi({
        capPrompts: dismissCapPrompt(
          preferences.ui.capPrompts,
          capPromptKey(asking.gymId, asking.exerciseId),
        ),
      });
      clear();
    },
    [preferences.ui.capPrompts, setUi, clear],
  );
  const confirm = useCallback(
    async (asking: { gymId: string; exerciseId: string; kg: number }) => {
      await setting.setLimits({ maxKg: asking.kg, stepKg: setting.stepKg });
      dismiss(asking);
    },
    [setting, dismiss],
  );
  return { confirm, dismiss };
}
