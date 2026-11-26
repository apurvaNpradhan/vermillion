import { dismissHint, isHintVisible, type HintId } from "@workspace/shared";
import { useCallback } from "react";

import { usePreferences } from "@/preferences";

/**
 * Whether a once-only hint is shown, and how to close it. The closed ids are the synced
 * `ui.dismissedHints` preference, so a hint closed on one phone stays closed on the next. Nothing
 * shows before the preferences have loaded, so a hint never flashes for a lifter who closed it.
 */
export function useHint(id: HintId) {
  const { preferences, hasPreferences, updateUi } = usePreferences();
  const visible = hasPreferences && isHintVisible(preferences.ui.dismissedHints, id);
  const dismiss = useCallback(() => {
    void updateUi((ui) => {
      const next = dismissHint(ui.dismissedHints, id);
      return next ? { dismissedHints: next } : null;
    }).catch(() => undefined);
  }, [updateUi, id]);
  return { visible, dismiss };
}
