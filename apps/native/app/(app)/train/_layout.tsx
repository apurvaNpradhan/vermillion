import { Stack } from "expo-router";

import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";

/** Sheet motion for the picker, the new-exercise form and the exercise sheet. */
const SHEET_OPTIONS = {
  presentation: "modal",
  animation: "slide_from_bottom",
  animationDuration: 220,
  gestureEnabled: true,
} as const;

/** The Train tab: the list of Workouts and the pages pushed from it; each draws its own header. */
export default function TrainLayout() {
  return (
    <Stack screenOptions={STACK_OPTIONS}>
      <Stack.Screen name="pick" options={SHEET_OPTIONS} />
      <Stack.Screen name="new-exercise" options={SHEET_OPTIONS} />
      <Stack.Screen name="workout/[id]/[entry]" options={SHEET_OPTIONS} />
    </Stack>
  );
}
