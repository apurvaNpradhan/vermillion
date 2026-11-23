import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

let reduced = false;
let started = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === reduced) return;
  reduced = next;
  listeners.forEach((listener) => listener());
}

/** One system subscription for the whole app, started by the first hook that mounts. */
function subscribe(listener: () => void) {
  if (!started) {
    started = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(set);
    AccessibilityInfo.addEventListener("reduceMotionChanged", set);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => reduced;
const readOnServer = () => false;

/**
 * Whether the system's Reduce Motion setting is on. Unlike Reanimated's `useReducedMotion`, which
 * reads the setting once at start-up, this follows changes while the app is open. Every motion
 * helper uses it, so one switch in system settings reaches them all. All callers share one
 * subscription, so a list row can call it without adding a listener of its own.
 */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, read, readOnServer);
}
