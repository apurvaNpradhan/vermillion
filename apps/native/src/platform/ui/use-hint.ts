import type { HintId } from "@workspace/shared";

import { useHintPreference } from "@/preferences";

/**
 * Whether a once-only hint is shown, and how to close it. The closed ids are the synced
 * `ui.dismissedHints` preference, so a hint closed on one phone stays closed on the next. Nothing
 * shows before the preferences have loaded, so a hint never flashes for a lifter who closed it.
 */
export function useHint(id: HintId) {
  return useHintPreference(id);
}
