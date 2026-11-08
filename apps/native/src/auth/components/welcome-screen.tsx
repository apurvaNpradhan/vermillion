import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import {
  ArrowsClockwise,
  Barbell,
  CloudSlash,
  ForkKnife,
  type IconProps,
} from "phosphor-react-native";
import type { ComponentType } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { welcomeTokens } from "../welcome-tokens";

/** The icons a translation may place in the headline, by tag name (`<sync/>`). */
const HEADLINE_ICONS = {
  barbell: Barbell,
  fork: ForkKnife,
  offline: CloudSlash,
  sync: ArrowsClockwise,
} as const satisfies Record<string, ComponentType<IconProps>>;

function isHeadlineIcon(name: string): name is keyof typeof HEADLINE_ICONS {
  return Object.hasOwn(HEADLINE_ICONS, name);
}
/** Delay between words as the headline comes in, once (motion-base per word, staggered). */
const STAGGER_MS = 35;

/**
 * The first screen when signed out, after reacticx's Welcome V4: the app's name at the top, a
 * large headline with Phosphor icons set into it, then Create account (the one primary action)
 * and Sign in. Social sign-in lives on the sign-in and sign-up screens.
 */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tokens = welcomeTokens(t("auth__welcome_headline"));

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
    >
      <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
        {appConfig.displayName}
      </Text>

      <View className="flex-1 justify-end pb-10">
        {/* Read as one sentence; the chips are decoration. */}
        <View
          accessible
          accessibilityLabel={tokens
            .flatMap((token) => (token.kind === "word" ? [token.text] : []))
            .join(" ")}
          className="flex-row flex-wrap items-center gap-x-2.5 gap-y-2"
        >
          {tokens.map((token, index) => (
            <Animated.View
              key={`${index}-${token.kind === "word" ? token.text : token.name}`}
              entering={FadeInDown.duration(200)
                .delay(index * STAGGER_MS)
                .reduceMotion(ReduceMotion.System)}
            >
              {token.kind === "word" ? (
                <Text className="font-semibold text-[34px] leading-[42px] tracking-tight text-foreground">
                  {token.text}
                </Text>
              ) : (
                <HeadlineChip
                  icon={isHeadlineIcon(token.name) ? HEADLINE_ICONS[token.name] : undefined}
                />
              )}
            </Animated.View>
          ))}
        </View>
        <Text className="pt-4 text-body-lg text-muted">{t("auth__welcome_body")}</Text>
      </View>

      <View className="gap-3">
        <Button size="lg" className="h-14 rounded-xl" onPress={() => router.push("/sign-up")}>
          <Button.Label className="text-body-lg font-semibold">
            {t("auth__sign_up_action")}
          </Button.Label>
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-14 rounded-xl"
          onPress={() => router.push("/sign-in")}
        >
          <Button.Label className="text-body-lg font-semibold">{t("nav__sign_in")}</Button.Label>
        </Button>
      </View>
    </View>
  );
}

function HeadlineChip({ icon: Icon }: { icon: ComponentType<IconProps> | undefined }) {
  const foreground = useThemeColor("foreground");
  if (!Icon) return null;
  return (
    <View className="h-10 w-14 items-center justify-center rounded-full border border-border bg-default">
      <Icon size={22} color={foreground} weight="fill" />
    </View>
  );
}
