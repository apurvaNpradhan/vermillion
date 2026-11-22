import { themeVariants, type ThemeVariant } from "@workspace/ui/tokens/theme-variants";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ScopedTheme } from "uniwind";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { PHOTO_CREDIT_URL } from "@/platform/photo-credit";
import { useThemeChoice } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { SigilMark } from "@/platform/ui/sigil-mark";
import { useAppToast } from "@/platform/ui/use-app-toast";

import { splitLegal } from "../legal-text";
import { useRegistrationStatus } from "../use-registration-status";
import { EmailSheet } from "./email-sheet";
import { GoogleButton } from "./google-button";

const LEGAL_PATHS = { terms: "/terms", privacy: "/privacy" } as const;
/** The photograph fills this share of the screen, fading into the ground at its lower edge. */
const PHOTO_SHARE = 0.62;
/** The fade covers this share of the photograph's height. */
const FADE_SHARE = 0.5;
/** Room above the wordmark where the scrim fades the photograph out behind the text. */
const SCRIM_RISE = 72;

/** The welcome screen is always dark Sigil; increased contrast follows the person's preference. */
export function welcomeVariant(contrast: boolean): ThemeVariant {
  return contrast ? "sigil-dark-contrast" : "sigil-dark";
}

/**
 * The first screen of a signed-out app: the graded Atlas photograph filling the top and fading
 * into the ground, mark A2 top-left, and at the bottom the wordmark, the tagline and the two ways
 * in (Google, email). The email field is not here: "Continue with email" opens a sheet, and a sent
 * code opens the code screen. The bottom block scrolls, pinned to the bottom, so a large font or a
 * short screen never clips it; a scrim keeps its text readable over the photograph.
 */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { toast } = useAppToast();
  const { choice } = useThemeChoice();
  const { sheet } = useLocalSearchParams<{ sheet?: string }>();
  const status = useRegistrationStatus();
  const [emailOpen, setEmailOpen] = useState(sheet === "email");
  const [creditShown, setCreditShown] = useState(false);

  const variant = welcomeVariant(choice.contrast);
  const ground = themeVariants[variant];
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

  return (
    <ScopedTheme theme={variant}>
      <View className="flex-1 bg-background">
        {/* The screen is dark whatever the app's appearance: light system bars over it. */}
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

        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            {/* The scrim: transparent at the top, the ground by the wordmark. */}
            <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
              <Svg width="100%" height="100%" accessible={false}>
                <Defs>
                  <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={ground.canvas} stopOpacity={0} />
                    <Stop offset="0.3" stopColor={ground.canvas} stopOpacity={0.88} />
                    <Stop offset="1" stopColor={ground.canvas} stopOpacity={1} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#scrim)" />
              </Svg>
            </View>
            <View
              className="mx-auto w-full max-w-md gap-3 px-6"
              style={{ paddingTop: SCRIM_RISE, paddingBottom: insets.bottom + 16 }}
            >
              <View className="gap-1 pb-3">
                <Text
                  accessibilityRole="header"
                  className="font-display text-display-wordmark text-foreground"
                >
                  {appConfig.displayName}
                </Text>
                <Text className="font-normal text-body-lg text-muted">
                  {t("auth__welcome_tagline")}
                </Text>
              </View>

              {status?.providers.google ? <GoogleButton glyphColor={ground["on-action"]} /> : null}
              <Button
                variant="secondary"
                size="lg"
                className="h-13 rounded-full"
                onPress={() => setEmailOpen(true)}
              >
                <Button.Label className="text-body-lg font-semibold text-foreground">
                  {t("auth__continue_with_email")}
                </Button.Label>
              </Button>

              <View className="gap-2 pt-3">
                {status && !status.open ? (
                  <Text className="font-normal text-center text-caption text-muted">
                    {status.mode === "invite" ? t("auth__invite_only_line") : t("auth__closed")}
                  </Text>
                ) : null}
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
                {creditShown ? (
                  <Text
                    accessibilityRole="link"
                    className="font-normal text-center text-caption text-muted underline"
                    onPress={() => void openPage(PHOTO_CREDIT_URL)}
                  >
                    {t("settings__photo_credit_line")}
                  </Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setCreditShown(true)}
                    className="items-center"
                  >
                    <Text className="font-normal text-center text-caption text-muted">
                      {t("auth__photo_credit")}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        <EmailSheet
          isOpen={emailOpen}
          onOpenChange={setEmailOpen}
          scope={variant}
          onSent={(email) => {
            setEmailOpen(false);
            router.push({ pathname: "/code", params: { email, flow: "sign-in" } });
          }}
        />
      </View>
    </ScopedTheme>
  );
}
