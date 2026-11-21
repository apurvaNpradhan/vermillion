import { Stack } from "expo-router";
import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";
/** The tab's first screen, kept under any page opened from another tab (`ANCHORED`). */
export const unstable_settings = { initialRouteName: "index" };
export default function Layout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}
