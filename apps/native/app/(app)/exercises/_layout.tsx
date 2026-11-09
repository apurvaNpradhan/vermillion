import { Stack } from "expo-router";

import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";

/** Sheet motion for the exercise form and the picker: they rise over the screen below. */
const FORM_OPTIONS = {
  presentation: "modal",
  animation: "slide_from_bottom",
  animationDuration: 220,
  gestureEnabled: true,
} as const;

/** The exercise library and the pages pushed from it; each page draws its own header. */
export default function ExercisesLayout() {
  return (
    <Stack screenOptions={STACK_OPTIONS}>
      <Stack.Screen name="pick" options={FORM_OPTIONS} />
      <Stack.Screen name="new" options={FORM_OPTIONS} />
      <Stack.Screen name="[id]/edit" options={FORM_OPTIONS} />
    </Stack>
  );
}
