import { useRouter } from "expo-router";
import { openURL } from "expo-linking";
import { Text, View } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { env } from "@/platform/env";
import { useTranslation } from "@/platform/i18n";
import { appConfig } from "@/platform/app-config";
import { Button } from "@/platform/ui/button";

import { splitLegal } from "../legal-text";
import { WelcomeArt } from "./welcome-art";

// motion-base: a gentle rise, staggered by a beat; Reduce Motion skips it.
const rise = (delay: number) =>
  FadeInDown.duration(200).delay(delay).reduceMotion(ReduceMotion.System);

/**
 * A wordmark, an almost empty canvas of soft shapes, a headline and two ways in: create an
 * account (the primary, since most people arriving here are new) or sign in. Both lead to the
 * email step with their own wording; the emailed code and the session guard tell new accounts
 * from returning ones, and neither answer reveals which an address is.
 */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const legal = splitLegal(t("auth__legal", { terms: "{terms}", privacy: "{privacy}" }));
  const legalLinks = {
    terms: { label: t("nav__terms"), path: "/terms" },
    privacy: { label: t("nav__privacy"), path: "/privacy" },
  } as const;

  return (
    <View className="flex-1 bg-background">
      <WelcomeArt />

      <View
        className="flex-1 px-6"
        style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
      >
        <Animated.View entering={rise(0)}>
          <Text className="text-title-md font-bold text-foreground">{appConfig.displayName}</Text>
        </Animated.View>

        <Animated.View entering={rise(60)} className="flex-1 justify-center">
          <Text
            accessibilityRole="header"
            className="text-center text-title-display font-bold text-foreground"
          >
            {t("auth__welcome_headline")}
          </Text>
        </Animated.View>

        <Animated.View entering={rise(120)} className="mx-auto w-full max-w-md gap-3">
          <Button
            variant="primary"
            size="lg"
            className="h-14 rounded-full"
            onPress={() => router.push({ pathname: "/email", params: { flow: "get-started" } })}
          >
            <Button.Label className="text-body-lg font-semibold">
              {t("auth__create_account")}
            </Button.Label>
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="h-14 rounded-full"
            onPress={() => router.push({ pathname: "/email", params: { flow: "sign-in" } })}
          >
            <Button.Label className="text-body-lg font-semibold">
              {t("auth__have_account")}
            </Button.Label>
          </Button>
        </Animated.View>

        <Animated.View entering={rise(180)} className="pt-5">
          <Text className="text-center text-caption text-muted">
            {legal.map((part, index) => {
              if (part.kind === "text") return part.text;
              const link = legalLinks[part.kind];
              return (
                <Text
                  key={`${part.kind}-${index}`}
                  accessibilityRole="link"
                  className="font-medium text-foreground"
                  onPress={() => void openURL(`${env.EXPO_PUBLIC_SERVER_URL}${link.path}`)}
                >
                  {link.label}
                </Text>
              );
            })}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}
