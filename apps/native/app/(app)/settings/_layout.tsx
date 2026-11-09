import { Stack } from "expo-router";

import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";

/** Settings and the pages pushed from it; each page draws its own header with a back button. */
export default function SettingsLayout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}
