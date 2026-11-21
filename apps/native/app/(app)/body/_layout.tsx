import { Stack } from "expo-router";

import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";

/** The tab's first screen, kept under any page opened from another tab (`ANCHORED`). */
export const unstable_settings = { initialRouteName: "weight" };

/** Weight, measurements, photos and Compare; each page draws its own header with a back button. */
export default function BodyLayout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}
