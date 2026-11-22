import { themeVariants } from "@workspace/ui/tokens/theme-variants";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ScopedTheme } from "uniwind";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { SigilMark } from "@/platform/ui/sigil-mark";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { PHOTO_CREDIT_URL } from "@/platform/photo-credit";

import { splitLegal } from "../legal-text";

// motion-base: a gentle rise, staggered by a beat; Reduce Motion skips it.
const rise = (delay: number) =>
  FadeInDown.duration(200).delay(delay).reduceMotion(ReduceMotion.System);

const LEGAL_PATHS = { terms: "/terms", privacy: "/privacy" } as const;
/** The photograph fills this share of the screen, fading into the ground at its lower edge. */
const PHOTO_SHARE = 0.65;
/** The fade covers this share of the photograph's height. */
const FADE_SHARE = 0.55;

/** The sign-in screen is always dark, whatever the app's appearance. */
const ground = themeVariants["sigil-dark"];

/**
 * The graded Atlas photograph fading into the ground, the mark top-left, the wordmark and tagline,
 * an email field with its one way in, and the legal line. Account creation and sign-in share the
 * email step: the emailed code and the session guard tell new accounts from returning ones, and
 * neither answer reveals which an address is.
 */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { toast } = useAppToast();
  const [email, setEmail] = useState("");
  const legal = splitLegal(t("auth__legal", { terms: "{terms}", privacy: "{privacy}" }));
  const legalLabels = { terms: t("nav__terms"), privacy: t("nav__privacy") } as const;
  const photoHeight = Math.round(height * PHOTO_SHARE);
  const fadeHeight = Math.round(photoHeight * FADE_SHARE);

  async function openPage(url: string) {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      toast.show({ label: t("auth__legal_open_failed") });
    }
  }

  function continueWithEmail() {
    router.push({
      pathname: "/email",
      params: { flow: "sign-in", ...(email.trim() ? { email: email.trim() } : {}) },
    });
  }

  return (
    <ScopedTheme theme="sigil-dark">
      <View className="flex-1 bg-background">
        <StatusBar style="light" />
        <Image
          source={require("../../../assets/images/sigil-atlas.jpg")}
          contentFit="cover"
          contentPosition="top"
          accessibilityIgnoresInvertColors
          accessible={false}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: photoHeight }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: photoHeight - fadeHeight,
            height: fadeHeight,
          }}
        >
          <Svg width="100%" height="100%" accessible={false}>
            <Defs>
              <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={ground.canvas} stopOpacity={0} />
                <Stop offset="1" stopColor={ground.canvas} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#fade)" />
          </Svg>
        </View>
        <View pointerEvents="none" style={{ position: "absolute", top: insets.top + 16, left: 24 }}>
          <SigilMark size={48} color={ground["text-primary"]} emberColor={ground["brand-detail"]} />
        </View>

        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View className="flex-1 justify-end px-6" style={{ paddingBottom: insets.bottom + 16 }}>
            <Animated.View entering={rise(0)} className="gap-1 pb-6">
              <Text
                accessibilityRole="header"
                className="font-display text-display-wordmark text-foreground"
              >
                {appConfig.displayName}
              </Text>
              <Text className="font-normal text-body-lg text-muted">
                {t("auth__welcome_tagline")}
              </Text>
            </Animated.View>

            <Animated.View entering={rise(80)} className="w-full max-w-md gap-3">
              <Field
                accessibilityLabel={t("auth__email")}
                placeholder={t("auth__email_placeholder")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                textContentType="emailAddress"
                returnKeyType="go"
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={continueWithEmail}
              />
              <Button
                variant="primary"
                size="lg"
                className="h-14 rounded-full"
                onPress={continueWithEmail}
              >
                <Button.Label className="text-body-lg font-semibold">
                  {t("auth__continue_with_email")}
                </Button.Label>
              </Button>
            </Animated.View>

            <Animated.View entering={rise(140)} className="gap-1 pt-5">
              <Text className="font-normal text-center text-caption text-muted">
                {legal.map((part, index) => {
                  if (part.kind === "text") return part.text;
                  return (
                    <Text
                      key={`${part.kind}-${index}`}
                      accessibilityRole="link"
                      className="font-medium text-foreground underline"
                      onPress={() =>
                        void openPage(`${appConfig.urls.site}${LEGAL_PATHS[part.kind]}`)
                      }
                    >
                      {legalLabels[part.kind]}
                    </Text>
                  );
                })}
              </Text>
              <Text
                accessibilityRole="link"
                className="font-normal text-center text-caption text-muted"
                onPress={() => void openPage(PHOTO_CREDIT_URL)}
              >
                {t("auth__photo_credit")}
              </Text>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </ScopedTheme>
  );
}
