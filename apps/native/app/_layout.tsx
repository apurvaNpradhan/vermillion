// Must stay first: installs `crypto` for Hermes before anything creates an id or opens PowerSync.
import "@/platform/local-database/crypto-polyfill";
import "../global.css";

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
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
import { AppProviders } from "@/platform/providers";
import { useDeviceOwner } from "@/sync";
import { applyStoredTheme } from "@/platform/theme";

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
  useAuthReturn(Boolean(session));
  // Any session (a sign-in, or one restored on start) ends an explicit sign-out.
  useEffect(() => {
    if (session) setSignedOut(false);
  }, [session]);

  // A device that holds a user's data opens without waiting for the session (ADR 0021).
  const guards = routeGuards(
    toSessionState({
      session: { isPending: sessionPending, hasSession: Boolean(session) },
      owner,
      signedOut,
    }),
  );
  // A font that fails to load falls back to the system font rather than blocking the app.
  const isPending = guards === null || (!fontsLoaded && !fontError);

  useEffect(() => {
    if (!isPending) void SplashScreen.hideAsync();
  }, [isPending]);

  if (isPending) return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={guards.app}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={guards.auth}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      {/* Opened by the link in the reset email, signed in or not. */}
      <Stack.Screen name="reset-password" />
      {/* Opened by the link in the deletion email. */}
      <Stack.Screen name="account-deleted" />
      <Stack.Screen name="confirm-deletion" />
    </Stack>
  );
}

export default function Layout() {
  return (
    <AppProviders>
      <StatusBar style="auto" />
      <RootStack />
    </AppProviders>
  );
}
