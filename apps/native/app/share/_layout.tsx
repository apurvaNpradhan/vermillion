import { Stack } from "expo-router";

import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";

/** The Share composer rises over whatever opened it (a Session, later a Workout or Program). */
export default function ShareLayout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}
