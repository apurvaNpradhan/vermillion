import { Stack } from "expo-router";

import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";

export default function AuthLayout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}
