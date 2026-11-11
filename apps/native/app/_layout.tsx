// Must stay first: installs `crypto` for Hermes before anything creates an id or opens PowerSync.
import "@/platform/local-database/crypto-polyfill";
import "@/platform/i18n/polyfills";
import "../global.css";

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { pendingOnboardingSteps } from "@workspace/shared";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import {
  routeGuards,
  setSignedOut,
  toSessionState,
  useAuthReturn,
  useSession,
  useSignedOut,
} from "@/auth";
import { STACK_OPTIONS } from "@/platform/navigation/stack-motion";
import { AppProviders } from "@/platform/providers";
import { useDeviceOwner } from "@/sync";
import { applyStoredTheme, useThemeMode } from "@/platform/theme";

void SplashScreen.preventAutoHideAsync();
// Before the first render, so the saved theme never flashes.
applyStoredTheme();

export const unstable_settings = { anchor: "(app)" };

function RootStack() {
  const { session, isPending: sessionPending } = useSession();
  const owner = useDeviceOwner();
  // Inter, mapped to HeroUI's font tokens in the generated native-tokens.css.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const signedOut = useSignedOut();
  // Any session (a sign-in, or one restored on start) ends an explicit sign-out.
  useEffect(() => {
    if (session) setSignedOut(false);
  }, [session]);

  // A device that holds a user's data opens without waiting for the session (ADR 0021).
  const guards = routeGuards(
    toSessionState({
      session: {
        isPending: sessionPending,
        hasSession: Boolean(session),
        needsOnboarding: session ? pendingOnboardingSteps(session.user).length > 0 : false,
      },
      owner,
      signedOut,
    }),
  );
  // A font that fails to load falls back to the system font rather than blocking the app.
  const isPending = guards === null || (!fontsLoaded && !fontError);
  // Keep the destination until onboarding is complete and the protected stack is mounted.
  useAuthReturn(Boolean(session), !isPending && guards?.app === true);

  useEffect(() => {
    if (!isPending) void SplashScreen.hideAsync();
  }, [isPending]);

  if (isPending) return null;
  return (
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
  );
}

function ThemedStatusBar() {
  const mode = useThemeMode();
  return <StatusBar style={mode === "dark" ? "light" : "dark"} />;
}

export default function Layout() {
  return (
    <AppProviders>
      <ThemedStatusBar />
      <RootStack />
    </AppProviders>
  );
}
