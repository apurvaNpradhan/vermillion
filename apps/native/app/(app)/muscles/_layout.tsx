import { Stack } from "expo-router";

import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";

/** The Muscles page, pushed from Home and History; it draws its own header with a back button. */
export default function MusclesLayout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}
