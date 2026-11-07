import { useLocalSearchParams } from "expo-router";

import { CheckInbox } from "@/auth";

export default function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  return <CheckInbox email={email ?? ""} />;
}
