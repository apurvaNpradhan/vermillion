import * as Haptics from "expo-haptics";

/**
 * The four haptic tokens from DESIGN.md. Screens call these, never `expo-haptics` directly, so
 * every buzz in the app means one of four things. Failures (no motor, haptics off) are ignored.
 */
export const haptic = {
  /** Selection changes: a tab, a chip, each step of a menu scrub. */
  tick: () => void Haptics.selectionAsync().catch(() => undefined),
  /** Something was saved or done: an exercise created, a row deleted. */
  confirm: () =>
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined),
  /** A goal reached. */
  success: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  /** A timer ran out; repeated three times by the caller that needs it. */
  alert: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
};
