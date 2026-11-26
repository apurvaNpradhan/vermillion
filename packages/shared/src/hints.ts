/**
 * Once-only hints. Which ones a lifter has closed is the synced `ui.dismissedHints` preference (a
 * list of ids, at most `DISMISSED_HINTS_MAX`). These pure functions decide what is shown and what
 * to save; they never touch storage.
 */
export const HINT_IDS = ["plan-weeks", "train-strip", "set-row"] as const;
export type HintId = (typeof HINT_IDS)[number];
export type HintDismissal = HintId | "reset";

/** The most ids the preference holds (its schema limit). */
export const DISMISSED_HINTS_MAX = 100;

/** Whether a hint is still to be shown: its id is not among the dismissed ones. */
export function isHintVisible(dismissed: readonly string[], id: HintId): boolean {
  return !dismissed.includes(id);
}

/**
 * The list to save after a hint is closed: the id added once. Other ids stay; if the list is full
 * the oldest drop so the new id always fits. `null` when nothing changes.
 */
export function dismissHint(dismissed: readonly string[], id: HintId): string[] | null {
  if (dismissed.includes(id)) return null;
  return [...dismissed, id].slice(-DISMISSED_HINTS_MAX);
}

/** The list to save for "Show tips again": the three hint ids removed, other ids kept. */
export function resetHints(dismissed: readonly string[]): string[] | null {
  const kept = dismissed.filter((id) => !HINT_IDS.some((hint) => hint === id));
  return kept.length === dismissed.length ? null : kept;
}

/** Apply one hint action to the current list, locally or when its upload arrives. */
export function applyHintDismissal(dismissed: readonly string[], action: HintDismissal) {
  return action === "reset" ? resetHints(dismissed) : dismissHint(dismissed, action);
}
