import { create } from "zustand";

/** The one "is this the max?" question waiting to be answered, on the exercise it is about. */
export const useMaxPromptStore = create<{
  asking: { exerciseId: string; gymId: string; kg: number } | null;
  ask: (value: { exerciseId: string; gymId: string; kg: number }) => void;
  clear: () => void;
}>((set) => ({
  asking: null,
  ask: (asking) => set({ asking }),
  clear: () => set({ asking: null }),
}));
