import { Stack } from "expo-router";

import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";

/** Weight, measurements, photos and Compare; each page draws its own header with a back button. */
export default function BodyLayout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}
