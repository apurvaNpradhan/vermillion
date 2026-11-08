import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { WarningCircleIcon } from "@phosphor-icons/react";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="error">
      <WarningCircleIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
