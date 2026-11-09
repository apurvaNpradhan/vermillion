import { useThemeColor } from "heroui-native";
import { Fingerprint } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { FormError } from "@/platform/ui/form-error";
import { useSignInWithPasskey } from "@/passkeys";

/**
 * Signs in with a passkey the device holds. A dismissed sheet stays silent; any other failure
 * shows one line. On success the session cookie is stored and the root guard opens the app.
 */
export function PasskeySignInButton({ blocked }: { blocked?: boolean }) {
  const { t } = useTranslation();
  const foreground = useThemeColor("foreground");
  const { signIn } = useSignInWithPasskey();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <View className="gap-3">
      <FormError message={failure} />
      <Button
        variant="secondary"
        className="h-13 rounded-xl"
        isDisabled={pending || blocked === true}
        onPress={async () => {
          setFailure(null);
          setPending(true);
          const outcome = await signIn();
          setPending(false);
          if (outcome.status === "error") setFailure(t(outcome.messageKey));
        }}
      >
        <Fingerprint size={18} color={foreground} weight="bold" />
        <Button.Label>{t("passkeys__sign_in")}</Button.Label>
      </Button>
    </View>
  );
}
