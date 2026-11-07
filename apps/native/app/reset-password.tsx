import { useLocalSearchParams } from "expo-router";

import { ResetPasswordForm } from "@/auth";

export default function ResetPassword() {
  const { token, error } = useLocalSearchParams<{ token?: string; error?: string }>();
  return <ResetPasswordForm {...(token ? { token } : {})} {...(error ? { error } : {})} />;
}
