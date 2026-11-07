import { Alert } from "heroui-native";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
