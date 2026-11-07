import { Alert } from "heroui-native";

/** A short status message (success or information). */
export function Notice({ status, message }: { status: "success" | "accent"; message: string }) {
  return (
    <Alert status={status}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
