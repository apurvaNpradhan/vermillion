// Must stay first: installs `crypto` for Hermes before anything creates an id or opens PowerSync.
import "@/platform/local-database/crypto-polyfill";
import "../global.css";

import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { useAuthReturn, useSession } from "@/auth";
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
  useAuthReturn(Boolean(session));

  // A device that holds a user's data opens it without waiting for the network or a session
  // (ADR 0021); any other waits for the session answer.
  const isPending = owner.isPending || (sessionPending && !owner.hasOwner);
  const hasAccess = Boolean(session) || owner.hasOwner;

  useEffect(() => {
    if (!isPending) void SplashScreen.hideAsync();
  }, [isPending]);

  if (isPending) return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={hasAccess}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
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
