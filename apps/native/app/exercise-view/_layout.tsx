import { Stack } from "expo-router";

import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";

/** Exercise details and history stay over the calling Session until dismissed. */
export default function ExerciseViewLayout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}
