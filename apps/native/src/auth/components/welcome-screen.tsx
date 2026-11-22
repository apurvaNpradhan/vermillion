import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Text, View } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Mascot } from "@/platform/ui/mascot";
import { useAppToast } from "@/platform/ui/use-app-toast";

import { splitLegal } from "../legal-text";

// motion-base: a gentle rise, staggered by a beat; Reduce Motion skips it.
const rise = (delay: number) =>
  FadeInDown.duration(200).delay(delay).reduceMotion(ReduceMotion.System);

const LEGAL_PATHS = { terms: "/terms", privacy: "/privacy" } as const;

/**
 * The tortoise, the wordmark and tagline, one way in (email) and the legal line. Account creation
 * and sign-in share the email step: the emailed code and the session guard tell new accounts
 * from returning ones, and neither answer reveals which an address is.
 */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useAppToast();
  const legal = splitLegal(t("auth__legal", { terms: "{terms}", privacy: "{privacy}" }));
  const legalLabels = { terms: t("nav__terms"), privacy: t("nav__privacy") } as const;

  async function openLegal(kind: keyof typeof LEGAL_PATHS) {
    try {
      await WebBrowser.openBrowserAsync(`${appConfig.urls.site}${LEGAL_PATHS[kind]}`);
    } catch {
      toast.show({ label: t("auth__legal_open_failed") });
    }
  }

  return (
    <View className="flex-1 bg-background">
      <View
        className="flex-1 px-6"
        style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
      >
        <Animated.View entering={rise(0)} className="flex-1 items-center justify-center gap-8">
          <Mascot size={176} tone="brand" />
          <View className="items-center gap-1">
            <Text
              accessibilityRole="header"
              className="font-semibold text-title-display text-foreground"
            >
              {appConfig.displayName}
            </Text>
            <Text className="font-normal text-body-lg text-muted">
              {t("auth__welcome_tagline")}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={rise(80)} className="mx-auto w-full max-w-md">
          <Button
            variant="primary"
            size="lg"
            className="h-14 rounded-full"
            onPress={() => router.push({ pathname: "/email", params: { flow: "sign-in" } })}
          >
            <Button.Label className="text-body-lg font-semibold">
              {t("auth__continue_with_email")}
            </Button.Label>
          </Button>
        </Animated.View>

        <Animated.View entering={rise(140)} className="pt-5">
          <Text className="font-normal text-center text-caption text-muted">
            {legal.map((part, index) => {
              if (part.kind === "text") return part.text;
              return (
                <Text
                  key={`${part.kind}-${index}`}
                  accessibilityRole="link"
                  className="font-medium text-foreground underline"
                  onPress={() => void openLegal(part.kind)}
                >
                  {legalLabels[part.kind]}
                </Text>
              );
            })}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}
