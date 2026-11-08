import { Spinner } from "heroui-native";
import { Link } from "expo-router";
import { Text } from "react-native";

import { DeleteAccountSection, ProfileSection } from "@/account";
import { useSignOut } from "@/auth";
import { useTranslation } from "@/platform/i18n";
import { SyncBanner, useSignOutConfirmation } from "@/sync";
import { Screen } from "@/platform/ui/screen";
import { Button } from "@/platform/ui/button";
import { Card } from "@/platform/ui/card";

/** Profile, a link to preferences, sign-out and account deletion in one place. */
export function SettingsScreen() {
  const { t } = useTranslation();
  const signOut = useSignOut();
  const requestSignOut = useSignOutConfirmation(() => signOut.mutate());
  return (
    <Screen>
      <SyncBanner />
      <ProfileSection />
      <Card>
        <Card.Body className="gap-3">
          <Link href="/settings/preferences" asChild>
            <Text className="text-foreground underline">{t("settings__nav_preferences")}</Text>
          </Link>
          <Button
            variant="secondary"
            className="self-start"
            isDisabled={signOut.isPending}
            onPress={() => void requestSignOut()}
          >
            {signOut.isPending ? <Spinner size="sm" /> : null}
            <Button.Label>{t("nav__sign_out")}</Button.Label>
          </Button>
        </Card.Body>
      </Card>
      <DeleteAccountSection />
    </Screen>
  );
}
