import { useLocalSearchParams } from "expo-router";

import { ConfirmDeletionScreen } from "@/account";

export default function ConfirmDeletion() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  return <ConfirmDeletionScreen {...(token ? { token } : {})} />;
}
