import { useLocalSearchParams } from "expo-router";

import { EmailScreen, parseFlowKind } from "@/auth";

export default function Email() {
  const { flow, email } = useLocalSearchParams<{ flow?: string; email?: string }>();
  return <EmailScreen flow={parseFlowKind(flow)} initialEmail={email} />;
}
