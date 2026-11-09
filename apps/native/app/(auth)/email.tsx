import { useLocalSearchParams } from "expo-router";

import { EmailScreen, parseFlowKind } from "@/auth";

export default function Email() {
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  return <EmailScreen flow={parseFlowKind(flow)} />;
}
