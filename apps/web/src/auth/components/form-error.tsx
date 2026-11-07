import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { CircleAlertIcon } from "lucide-react";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="error">
      <CircleAlertIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
