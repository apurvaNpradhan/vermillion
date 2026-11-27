import { Stack } from "expo-router";

import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";

/**
 * The Session modal: the logging screen, its exercise picker, the equipment manager (pushed from
 * the plate calculator, with a Back button), the Warm-ups screen and the summary after Finish.
 */
export default function SessionLayout() {
  return (
    <Stack screenOptions={STACK_OPTIONS}>
      <Stack.Screen
        name="pick"
        options={{ presentation: "modal", animation: "slide_from_bottom", animationDuration: 220 }}
      />
      <Stack.Screen name="equipment" />
      <Stack.Screen name="warmups" />
      <Stack.Screen
        name="new-exercise"
        options={{ presentation: "modal", animation: "slide_from_bottom", animationDuration: 220 }}
      />
    </Stack>
  );
}
