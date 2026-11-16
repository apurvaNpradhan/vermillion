import { useSyncExternalStore } from "react";

import { deviceStorage } from "@/platform/storage";

import { readStallMemory, writeStallMemory } from "./stall-state";

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

/** Dismiss the note, or apply (or undo) today's deload, for an exercise's latest Session. */
export function changeStall(
  exerciseId: string,
  latestSessionId: string,
  change: Partial<{ dismissed: boolean; applied: boolean }>,
): void {
  deviceStorage.set(
    key(exerciseId),
    writeStallMemory(deviceStorage.get(key(exerciseId)), latestSessionId, change),
  );
  version += 1;
  for (const listener of listeners) listener();
}
