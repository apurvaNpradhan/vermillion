import { Stack } from "expo-router";

import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";

/** Adding a shared Program or Workout: the code entry and the preview a link opens. */
export default function ImportLayout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}
