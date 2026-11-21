import type { NavigationState } from "expo-router";

/** A root modal blurs the active tab without changing the selected tab. */
export function blurredTabStack(tabs: NavigationState, blurredKey: string): string | undefined {
  if (tabs.routes[tabs.index]?.key === blurredKey) return;
  const stack = tabs.routes.find((tab) => tab.key === blurredKey)?.state;
  if (stack?.type === "stack" && (stack.index ?? 0) > 0) return stack.key;
}
