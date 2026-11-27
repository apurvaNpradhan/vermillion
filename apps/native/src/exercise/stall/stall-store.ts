import { useSyncExternalStore } from "react";

import { deviceStorage } from "@/platform/storage";

import { readStallMemory } from "./stall-state";

const key = (exerciseId: string) =>
  `device.stall.${exerciseId.replaceAll(/[^A-Za-z0-9._-]/g, "_")}`;

let version = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Re-renders a component when any stall memory changes; read with {@link stallMemory}. */
export const useStallVersion = () => useSyncExternalStore(subscribe, () => version);

/** The device's memory of an exercise's stall, as it applies with `latestSessionId` newest. */
export const stallMemory = (exerciseId: string, latestSessionId: string | null) =>
  readStallMemory(deviceStorage.get(key(exerciseId)), latestSessionId);

/** Dismiss the note for this exercise and baseline Session. */
export function dismissStall(exerciseId: string, latestSessionId: string): void {
  deviceStorage.set(
    key(exerciseId),
    JSON.stringify({ sessionId: latestSessionId, dismissed: true }),
  );
  version += 1;
  for (const listener of listeners) listener();
}
