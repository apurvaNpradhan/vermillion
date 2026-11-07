import { useLocalSearchParams } from "expo-router";

import { SignInForm } from "@/auth";

export default function SignIn() {
  const { reset } = useLocalSearchParams<{ reset?: string }>();
  return <SignInForm resetDone={reset === "done"} />;
}
