import { Link } from "expo-router";
import { Spinner } from "heroui-native";
import { Text, View } from "react-native";
import { errorMessage } from "@workspace/client/error-message";

import { useSession } from "@/auth";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { Screen } from "@/platform/ui/screen";

import { useConfirmDeletion } from "../use-confirm-deletion";
import { AccountDeletedScreen } from "./account-deleted-screen";
import { Button } from "@/platform/ui/button";

/** Email confirmation is explicitly redeemed inside the app, using its own authenticated session. */
export function ConfirmDeletionScreen({ token }: { token?: string }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const { confirmDeletion, isPending, isSuccess, error } = useConfirmDeletion();
  if (isSuccess) return <AccountDeletedScreen />;
  return (
    <Screen withTopInset>
      <View className="mx-auto w-full max-w-sm flex-1 justify-center gap-6 py-6">
        <Text accessibilityRole="header" className="font-semibold text-title-xl text-foreground">
          {t("settings__delete_title")}
        </Text>
        <Text className="text-muted">{t("settings__delete_body")}</Text>
        <FormError
          message={error ? errorMessage(t, error) : !token ? t("auth__error_invalid_token") : null}
        />
        {session ? (
          <Button
            variant="danger-soft"
            isDisabled={!token || isPending}
            onPress={() => {
              if (token) confirmDeletion({ token });
            }}
          >
            {isPending ? <Spinner size="sm" /> : null}
            <Button.Label>{t("settings__delete_action")}</Button.Label>
          </Button>
        ) : (
          <Link href="/sign-in" asChild>
            <Button>
              <Button.Label>{t("nav__sign_in")}</Button.Label>
            </Button>
          </Link>
        )}
      </View>
    </Screen>
  );
}
