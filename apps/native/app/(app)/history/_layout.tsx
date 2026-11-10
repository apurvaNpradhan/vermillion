import { Stack } from "expo-router";
import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";
export const unstable_settings = { initialRouteName: "index" };
export default function Layout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}
