import { Stack } from "expo-router";
import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";
export default function Layout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}
