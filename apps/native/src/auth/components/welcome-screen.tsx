import { useThemeColor } from "heroui-native";
import {
  useLocalSearchParams,
  useNavigation,
  useRouter,
  type NativeStackNavigationProp,
} from "expo-router";
import type { ParamListBase } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useLayoutEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { useAccentTextColor, useOnActionColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { SigilMark } from "@/platform/ui/sigil-mark";
import { useAppToast } from "@/platform/ui/use-app-toast";

import { splitLegal } from "../legal-text";
import { useRegistrationStatus } from "../use-registration-status";
import { EmailSheet } from "./email-sheet";
import { GoogleButton } from "./google-button";
import { LiveLogVignette } from "./live-log-vignette";

const LEGAL_PATHS = { terms: "/terms", privacy: "/privacy" } as const;

/**
 * The first screen of a signed-out app: mark A2 top-left, a looping vignette of the live log, and
 * at the bottom the wordmark, the tagline and the two ways in (Google, email). The email field is
 * not here: "Continue with email" opens a sheet, and a sent code opens the code screen. It follows
 * the app's mode and accent. The content scrolls, pinned to the bottom, so a large font or a short
 * screen never clips the buttons.
 */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const authRoute = navigation.getParent<NativeStackNavigationProp<ParamListBase>>();
  const insets = useSafeAreaInsets();
  const { toast } = useAppToast();
  const accent = useAccentTextColor();
  const onAccent = useOnActionColor();
  const ink = useThemeColor("foreground");
  const { sheet } = useLocalSearchParams<{ sheet?: string }>();
  const status = useRegistrationStatus();
  const googleAvailable = status?.providers.google === true;
  const [emailOpen, setEmailOpen] = useState(false);
  const autoOpened = useRef(false);

  const openEmail = () => {
    if (sheet === "email") {
      autoOpened.current = true;
      router.setParams({ sheet: undefined });
    }
    setEmailOpen(true);
  };

  // The banner pushes the auth group on the root stack. Its nested welcome route doesn't
  // animate, so listen on the parent route and only open while welcome is still focused.
  useLayoutEffect(() => {
    if (sheet !== "email" || !authRoute) return;
    return authRoute.addListener("transitionEnd", ({ data }) => {
      if (data.closing || !navigation.isFocused() || autoOpened.current) return;
      autoOpened.current = true;
      router.setParams({ sheet: undefined });
      setEmailOpen(true);
    });
  }, [authRoute, navigation, router, sheet]);

  const legal = splitLegal(t("auth__legal", { terms: "{terms}", privacy: "{privacy}" }));
  const legalLabels = { terms: t("nav__terms"), privacy: t("nav__privacy") } as const;

  async function openPage(url: string) {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      toast.show({ label: t("auth__legal_open_failed") });
    }
  }

  return (
    <>
      <View className="flex-1 bg-background">
        <StatusBar style="auto" />
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "space-between",
            paddingTop: insets.top + 16,
          }}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="px-6 pb-6" accessible={false}>
            <SigilMark size={48} color={ink} emberColor={accent} />
          </View>
          <View>
            <View
              className="mx-auto w-full max-w-md gap-3 px-6"
              style={{ paddingTop: 0, paddingBottom: insets.bottom + 16 }}
            >
              <View className="pb-4">
                <LiveLogVignette />
              </View>
              <View className="gap-1 pb-3">
                <Text
                  accessibilityRole="header"
                  className="font-semibold text-display-wordmark text-foreground"
                >
                  {appConfig.displayName}
                </Text>
                <Text className="font-normal text-body-lg text-muted">
                  {t("auth__welcome_tagline")}
                </Text>
              </View>

              {googleAvailable ? <GoogleButton glyphColor={onAccent ?? ink} /> : null}
              <Button
                variant={googleAvailable ? "secondary" : "primary"}
                size="lg"
                className="h-auto min-h-13 rounded-full py-3"
                onPress={openEmail}
              >
                <Button.Label className="shrink text-body-lg font-semibold">
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
              </View>
            </View>
          </View>
        </ScrollView>

        <EmailSheet
          isOpen={emailOpen}
          onOpenChange={setEmailOpen}
          onSent={(email) => {
            setEmailOpen(false);
            router.push({ pathname: "/code", params: { email, flow: "sign-in" } });
          }}
        />
      </View>
    </>
  );
}
