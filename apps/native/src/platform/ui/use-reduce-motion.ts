import { useSyncExternalStore } from "react";
import { AccessibilityInfo, AppState } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

let reduced: boolean | undefined;
let stop: (() => void) | undefined;
const listeners = new Set<() => void>();

/** The mounted consumers share one system listener and one foreground refresh. */
function subscribe(listener: () => void) {
  listeners.add(listener);
  stop ??= start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop?.();
      stop = undefined;
      // The OS setting can change with no mounted consumers. Wait for the next refresh.
      reduced = true;
    }
  };
}

function start() {
  let active = true;
  let revision = 0;
  const set = (next: boolean) => {
    if (!active) return;
    revision += 1;
    if (next === reduced) return;
    reduced = next;
    listeners.forEach((listener) => listener());
  };
  const refresh = () => {
    const request = ++revision;
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (next) => {
        if (active && request === revision) set(next);
      },
      () => {},
    );
  };
  const accessibility = AccessibilityInfo.addEventListener("reduceMotionChanged", set);
  const appState = AppState.addEventListener("change", (state) => {
    if (state === "active") refresh();
  });
  refresh();
  return () => {
    active = false;
    accessibility.remove();
    appState.remove();
  };
}

const read = () => reduced;

/** Use Reanimated's synchronous startup value until the first native query resolves. */
export function useReduceMotion(): boolean {
  const initial = useReducedMotion();
  return useSyncExternalStore(subscribe, read, read) ?? initial;
}
