// Must stay first: installs `crypto` for Hermes before anything creates an id or opens PowerSync.
import "@/platform/local-database/crypto-polyfill";
import "@/platform/i18n/polyfills";
import "../global.css";

import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { Geist_700Bold } from "@expo-google-fonts/geist/700Bold";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono/500Medium";
import { EBGaramond_500Medium } from "@expo-google-fonts/eb-garamond/500Medium";
import { EBGaramond_600SemiBold } from "@expo-google-fonts/eb-garamond/600SemiBold";
import { useFonts } from "expo-font";
import { pendingOnboardingSteps } from "@workspace/shared";
import { useSetupPending } from "@/onboarding";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { useEffect } from "react";

import {
  routeGuards,
  toSessionState,
  useAuthReturn,
  useExpireSessionOnResume,
  useSession,
  useSignedOut,
} from "@/auth";
import { BodyReminderHost } from "@/body";
import { useNotificationNavigation } from "@/platform/navigation/use-notification-navigation";
import { RestNotificationHost, WorkoutLiveHost } from "@/session";
import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";
import { AppProviders } from "@/platform/providers";
import { UpdateHost } from "@/release";
import { useDeviceOwner } from "@/sync";
import { applyStoredTheme, useThemeMode } from "@/platform/theme";

void SplashScreen.preventAutoHideAsync();
// Before the first render, so the saved theme never flashes.
applyStoredTheme();

export const unstable_settings = { anchor: "(app)" };

function RootStack() {
  const { session, isPending: sessionPending } = useSession();
  const owner = useDeviceOwner();
  useExpireSessionOnResume();
  // The registration keys match the generated native font tokens.
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    EBGaramond_500Medium,
    EBGaramond_600SemiBold,
  });
  const signedOut = useSignedOut();
  // A new account stays in onboarding until the steps after its name are done (or skipped).
  const setupPending = useSetupPending(session?.user.id ?? "");
  // A sign-in the server confirmed ends an explicit sign-out (stored-session.ts), nothing else.

  // A device that holds a user's data opens without waiting for the session (ADR 0021).
  const guards = routeGuards(
    toSessionState({
      session: {
        isPending: sessionPending,
        hasSession: Boolean(session),
        needsOnboarding: session
          ? pendingOnboardingSteps(session.user).length > 0 || setupPending
          : false,
      },
      owner,
      signedOut,
    }),
  );
  // A font that fails to load falls back to the system font rather than blocking the app.
  const isPending = guards === null || (!fontsLoaded && !fontError);
  // Keep the destination until onboarding is complete and the protected stack is mounted.
  useAuthReturn(Boolean(session), !isPending && guards?.app === true);
  useNotificationNavigation(!isPending && guards?.app === true);

  useEffect(() => {
    if (!isPending) void SplashScreen.hideAsync();
  }, [isPending]);

  if (isPending) return null;
  return (
    <UpdateHost>
      {guards.app && (
        <>
          <RestNotificationHost />
          <BodyReminderHost />
          <WorkoutLiveHost />
        </>
      )}
      <Stack screenOptions={STACK_OPTIONS}>
        <Stack.Protected guard={guards.app}>
          <Stack.Screen name="(app)" />
          {/* The logging screen rises over the tabs; its chevron minimises it. */}
          <Stack.Screen
            name="session"
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
              animationDuration: 220,
            }}
          />
          <Stack.Screen
            name="share"
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
              animationDuration: 220,
            }}
          />
          <Stack.Screen
            name="exercise-view"
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
              animationDuration: 220,
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={guards.auth}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={guards.onboarding}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        {/* Opened by the link in the deletion email. */}
        <Stack.Screen name="account-deleted" />
        <Stack.Screen name="confirm-deletion" />
      </Stack>
    </UpdateHost>
  );
}

function ThemedStatusBar() {
  const mode = useThemeMode();
  const style = mode === "dark" ? "light" : "dark";
  return (
    <>
      <StatusBar style={style} />
      {Platform.OS === "android" ? <NavigationBar style={style} /> : null}
    </>
  );
}

export default function Layout() {
  return (
    <AppProviders>
      <ThemedStatusBar />
      <RootStack />
    </AppProviders>
  );
}
