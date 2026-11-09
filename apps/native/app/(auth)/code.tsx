import { useLocalSearchParams } from "expo-router";

import { CodeScreen, parseFlowKind } from "@/auth";

export default function Code() {
  const { email, flow } = useLocalSearchParams<{ email?: string; flow?: string }>();
  return <CodeScreen email={email ?? ""} flow={parseFlowKind(flow)} />;
}
